import * as localforage from 'localforage';
import { sleep } from './util';

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
        if (options.cacheInLocalStorage) {
            const cached = await localforage.getItem<string>(`http-request: ${options.url}`);
            if (cached) {
                return cached;
            }
        }

        if (options.cacheBusting) {
            const url = new URL(options.url);
            url.searchParams.set('nocache', Date.now().toString());
            options.url = url.toString();
        }

        try {
            const response = await fetch(options.url, {
                ...options,
                method: options.method,
            });

            if (response.ok) {
                const text = await response.text();
                if (options.cacheInLocalStorage) {
                    await localforage.setItem(`http-request: ${options.url}`, text);
                }
                return text;
            } else {
                throw new Error(`HTTP error! status: ${response.status}`, { cause: response });
            }
        } catch (e) {
            if (options.retryCount ?? 0 > 0) {
                const delay = Math.random() * 100;
                console.warn('Request failed, will retry in ${delay}ms', e);
                //small timeout then try again
                await sleep(delay);
                return this.request({
                    ...options,
                    retryCount: (options.retryCount ?? 0) - 1
                });
            } else {
                throw e;
            }
        }
    }
}

export interface RequestOptions extends RequestInit {
    url: string;
    method?: 'GET';
    cacheBusting?: true;
    cacheInLocalStorage?: boolean;
    retryCount?: number;
}

export const http = new Http();
