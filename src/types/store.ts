export interface StoreListing {
  title: string;
  price: string | null;
  cover_url: string | null;
  store_url: string;
  store: string;
}

export interface StoreSearchResult {
  listings: StoreListing[];
  page: number;
  total_pages: number;
}
