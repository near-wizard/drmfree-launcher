export interface Game {
  id: string;
  name: string;
  provider: string;
  install_dir: string | null;
  exe_path: string | null;
}
