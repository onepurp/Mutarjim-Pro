export const callWithRetryAndTimeout = async <T>(
    fn: () => Promise<T>,
    options: { timeoutMs?: number; retries?: number; delayMs?: number; onRetry?: (error: any, attempt: number) => void } = {}
): Promise<T> => {
    const { timeoutMs = 60000, retries = 3, delayMs = 2000, onRetry } = options;

    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const timeoutPromise = new Promise<never>((_, reject) => {
                setTimeout(() => reject(new Error('REQUEST_TIMEOUT')), timeoutMs);
            });
            return await Promise.race([fn(), timeoutPromise]);
        } catch (error: any) {
            const isRetryable =
                error?.message === 'REQUEST_TIMEOUT' ||
                error?.status === 429 ||
                error?.message?.includes("429") ||
                error?.message?.includes("quota") ||
                error?.message?.toLowerCase().includes("timeout") ||
                error?.message?.includes("503") ||
                error?.message?.includes("502") ||
                error?.message?.includes("500") ||
                error?.name === 'AbortError' ||
                error?.name === 'FetchError';

            if (!isRetryable || attempt === retries) {
                throw error;
            }
            onRetry?.(error, attempt);
            const delay = delayMs * Math.pow(2, attempt - 1);
            await new Promise((resolve) => setTimeout(resolve, delay));
        }
    }
    throw new Error('Retry failed');
};
