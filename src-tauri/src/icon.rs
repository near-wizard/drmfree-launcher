//! Last-resort cover art: extract the icon embedded in an installed
//! game's own .exe. Used where a provider has no better source — today
//! that's Epic (no cover-art API is called; see the doc comment on
//! `icon_source` in `providers::Game`) and Humble (no cover-art
//! endpoint at all). Local-first by construction: no network call, no
//! API key, just reading a file already on disk.

/// Returns a `data:image/png;base64,...` URI for `path`'s own icon, or
/// `Ok(None)` if the path doesn't exist or has no icon to extract —
/// either is "no cover art," not a failure worth surfacing to the UI.
#[tauri::command]
pub async fn get_exe_icon(path: String) -> Result<Option<String>, String> {
    if !std::path::Path::new(&path).exists() {
        return Ok(None);
    }

    #[cfg(target_os = "windows")]
    {
        use base64::Engine;
        Ok(windows_impl::extract_png(&path)
            .map(|bytes| format!("data:image/png;base64,{}", base64::engine::general_purpose::STANDARD.encode(bytes))))
    }

    #[cfg(not(target_os = "windows"))]
    {
        // Icon extraction from a PE resource is a Windows-specific
        // concept; Epic itself has no native Linux/macOS client (see
        // providers::epic's own manifests_dir comment), so this simply
        // never gets called with anything meaningful there.
        Ok(None)
    }
}

#[cfg(target_os = "windows")]
mod windows_impl {
    use std::mem::size_of;
    use std::sync::Mutex;
    use windows::core::PCWSTR;
    use windows::Win32::Foundation::HWND;
    use windows::Win32::Graphics::Gdi::{
        DeleteObject, GetDC, GetDIBits, GetObjectW, ReleaseDC, BITMAP, BITMAPINFO,
        BITMAPINFOHEADER, DIB_RGB_COLORS, HGDIOBJ,
    };
    use windows::Win32::Storage::FileSystem::FILE_FLAGS_AND_ATTRIBUTES;
    use windows::Win32::UI::Shell::{SHFILEINFOW, SHGFI_ICON, SHGFI_LARGEICON, SHGetFileInfoW};
    use windows::Win32::UI::WindowsAndMessaging::{DestroyIcon, GetIconInfo, ICONINFO};

    /// `SHGetFileInfoW`'s icon retrieval goes through COM under the
    /// hood and isn't safe to call from multiple threads at once
    /// without each thread doing its own COM init — confirmed the hard
    /// way: concurrent calls from Tauri's async command threads
    /// intermittently returned an invalid `HICON` for a real exe that
    /// worked fine called alone. Rather than juggle per-thread COM
    /// initialization for what's an infrequent, non-performance-
    /// critical lookup (a handful of calls when cards first mount,
    /// cached client-side after), just serialize all extraction calls
    /// through one lock.
    static EXTRACT_LOCK: Mutex<()> = Mutex::new(());

    /// Reads `path`'s associated large icon via the shell (the same
    /// icon Explorer would show for that exe) and re-encodes it as a
    /// PNG. Returns `None` on any failure along the way — extraction
    /// touching an unusual/corrupt exe shouldn't ever be a hard error,
    /// just "no icon."
    pub fn extract_png(path: &str) -> Option<Vec<u8>> {
        let _guard = EXTRACT_LOCK.lock().unwrap_or_else(|e| e.into_inner());

        let wide: Vec<u16> = path.encode_utf16().chain(std::iter::once(0)).collect();
        let mut info = SHFILEINFOW::default();

        // SAFETY: `wide` is a valid null-terminated UTF-16 buffer kept
        // alive for the call, `info` is a valid out-pointer sized via
        // size_of::<SHFILEINFOW>() as the API requires.
        let has_icon = unsafe {
            SHGetFileInfoW(
                PCWSTR(wide.as_ptr()),
                FILE_FLAGS_AND_ATTRIBUTES(0),
                Some(&mut info),
                size_of::<SHFILEINFOW>() as u32,
                SHGFI_ICON | SHGFI_LARGEICON,
            )
        };
        if has_icon == 0 || info.hIcon.is_invalid() {
            return None;
        }
        let hicon = info.hIcon;

        let mut icon_info = ICONINFO::default();
        // SAFETY: hicon was just returned as valid by SHGetFileInfoW.
        let got_info = unsafe { GetIconInfo(hicon, &mut icon_info) };
        if got_info.is_err() {
            unsafe {
                let _ = DestroyIcon(hicon);
            }
            return None;
        }

        let result = extract_bitmap_rgba(icon_info.hbmColor);

        // Every GDI handle GetIconInfo hands back is ours to free.
        unsafe {
            let _ = DeleteObject(HGDIOBJ(icon_info.hbmColor.0));
            let _ = DeleteObject(HGDIOBJ(icon_info.hbmMask.0));
            let _ = DestroyIcon(hicon);
        }

        let (width, height, mut rgba) = result?;

        // GetDIBits returns BGRA; <img>/PNG want RGBA.
        for px in rgba.as_chunks_mut::<4>().0 {
            px.swap(0, 2);
        }

        use image::ImageEncoder;
        let mut png_bytes = Vec::new();
        image::codecs::png::PngEncoder::new(&mut png_bytes)
            .write_image(&rgba, width as u32, height as u32, image::ExtendedColorType::Rgba8)
            .ok()?;
        Some(png_bytes)
    }

    /// Reads a color bitmap's raw top-down 32bpp pixels via `GetDIBits`.
    /// A negative height in the requested `BITMAPINFOHEADER` is what
    /// asks for top-down (row 0 first) instead of GDI's native
    /// bottom-up order — matters here because the PNG encoder expects
    /// rows in top-down order too.
    fn extract_bitmap_rgba(hbitmap: windows::Win32::Graphics::Gdi::HBITMAP) -> Option<(i32, i32, Vec<u8>)> {
        let mut bmp = BITMAP::default();
        // SAFETY: hbitmap is a valid bitmap handle from GetIconInfo;
        // `bmp` is sized to match what GetObjectW expects for a BITMAP.
        let got = unsafe {
            GetObjectW(
                HGDIOBJ(hbitmap.0),
                size_of::<BITMAP>() as i32,
                Some(&mut bmp as *mut _ as *mut _),
            )
        };
        if got == 0 {
            return None;
        }

        let width = bmp.bmWidth;
        let height = bmp.bmHeight;
        if width <= 0 || height <= 0 {
            return None;
        }

        let mut bmi = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: width,
                biHeight: -height,
                biPlanes: 1,
                biBitCount: 32,
                biCompression: 0, // BI_RGB
                ..Default::default()
            },
            ..Default::default()
        };

        let mut buffer = vec![0u8; (width as usize) * (height as usize) * 4];
        // SAFETY: a screen DC is a valid device context for GetDIBits
        // even though the bitmap isn't selected into it; `buffer` is
        // sized exactly for width*height*4 bytes as bmi describes.
        let hdc = unsafe { GetDC(HWND(std::ptr::null_mut())) };
        let scanlines = unsafe {
            GetDIBits(
                hdc,
                hbitmap,
                0,
                height as u32,
                Some(buffer.as_mut_ptr() as *mut _),
                &mut bmi,
                DIB_RGB_COLORS,
            )
        };
        unsafe {
            ReleaseDC(HWND(std::ptr::null_mut()), hdc);
        }
        if scanlines == 0 {
            return None;
        }

        Some((width, height, buffer))
    }

    #[cfg(test)]
    mod tests {
        use super::*;

        #[test]
        fn extract_png_returns_a_decodable_png_for_a_real_windows_exe() {
            let png = extract_png("C:\\Windows\\System32\\notepad.exe")
                .expect("notepad.exe ships an icon on every Windows install");
            assert_eq!(&png[0..8], &[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A]);
            image::load_from_memory(&png).expect("output must be a valid, decodable PNG");
        }

        #[test]
        fn extract_png_returns_none_for_a_nonexistent_path() {
            // No file to stat means no icon to look up — this is the
            // path get_exe_icon's own existence check is meant to
            // short-circuit before ever reaching here, but extract_png
            // itself should degrade the same way if ever called directly.
            assert!(extract_png("C:\\definitely\\does\\not\\exist.exe").is_none());
        }
    }
}
