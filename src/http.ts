import * as localforage from 'localforage';

export class Http {
    /**
     * Do an http get request
     * @param url
     * @param cache
     */
    public async get(options: RequestOptions) {
        return this.request({
            ...options,
            method: 'GET'
        });
    }

    public async request(options: RequestOptions): Promise<string> {
        if (options.cacheBusting) {
            const url = new URL(options.url);
            url.searchParams.set('nocache', Date.now().toString());
            options.url = url.toString();
        }

        if (options.cacheInLocalStorage) {
            const cached = await localforage.getItem<string>(`http-request: ${options.url}`);
            if (cached) {
                return cached;
            }
        }

        const response = await fetch(options.url, {
            method: options.method,
        });

        if (response.ok) {
            const text = await response.text();
            if (options.cacheInLocalStorage) {
                await localforage.setItem(`http-request: ${options.url}`, text);
            }
            return text;
        } else {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
    }
}

export interface RequestOptions {
    url: string;
    method?: 'GET';
    cacheBusting?: true;
    cacheInLocalStorage?: boolean;
}

export const http = new Http();
