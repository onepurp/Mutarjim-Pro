// Dynamic Font Registry & Fetching Service
// Uses jsDelivr / @fontsource to fetch ANY requested open source font.

export interface FontAsset {
    id: string; // e.g. "merriweather-latin-400"
    family: string; // e.g. "Merriweather"
    filename: string; // e.g. "merriweather-latin-400-normal.woff2"
    format: 'woff2';
    buffer: ArrayBuffer;
    weight: number;
    style: 'normal' | 'italic';
}

// We map the requested roles to specific weights we want to download
const WEIGHT_MAP = {
    body: [400, 700, 400], // Regular, Bold, Italic(via style check)
    heading: [700],
    subheading: [600, 400],
    quote: [400],
    code: [400]
};

// Helper to construct the CDN URL
// Pattern: https://cdn.jsdelivr.net/npm/@fontsource/[package]/files/[package]-[subset]-[weight]-[style].woff2
const getFontUrl = (kebabName: string, subset: string, weight: number, style: 'normal' | 'italic') => {
    return `https://cdn.jsdelivr.net/npm/@fontsource/${kebabName}/files/${kebabName}-${subset}-${weight}-${style}.woff2`;
};

export const fetchFontFile = async (url: string): Promise<ArrayBuffer | null> => {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            // Silently fail for specific variants that might not exist (e.g. some fonts don't have 700 weight)
            // console.warn(`Font variant not found: ${url}`);
            return null;
        }
        return await response.arrayBuffer();
    } catch (e) {
        console.error("Font fetch failed:", e);
        return null;
    }
};

/**
 * Downloads a set of font files for a specific font family recommendation.
 * Tries to fetch Regular (400), Bold (700), and Italic (400) if applicable to the role.
 */
export const downloadFontFamily = async (
    kebabName: string, 
    family: string, 
    subset: string, 
    role: keyof typeof WEIGHT_MAP
): Promise<FontAsset[]> => {
    const assets: FontAsset[] = [];
    const weightsToTry = WEIGHT_MAP[role] || [400];
    
    // De-duplicate weights
    const uniqueWeights = [...new Set(weightsToTry)];

    for (const weight of uniqueWeights) {
        // Try Normal
        const normalUrl = getFontUrl(kebabName, subset, weight, 'normal');
        const normalBuf = await fetchFontFile(normalUrl);
        if (normalBuf) {
            assets.push({
                id: `${kebabName}-${subset}-${weight}-normal`,
                family,
                filename: `${kebabName}-${subset}-${weight}-normal.woff2`,
                format: 'woff2',
                buffer: normalBuf,
                weight,
                style: 'normal'
            });
        }

        // Try Italic (only for body or quote typically)
        if (role === 'body' || role === 'quote') {
             const italicUrl = getFontUrl(kebabName, subset, weight, 'italic');
             const italicBuf = await fetchFontFile(italicUrl);
             if (italicBuf) {
                assets.push({
                    id: `${kebabName}-${subset}-${weight}-italic`,
                    family,
                    filename: `${kebabName}-${subset}-${weight}-italic.woff2`,
                    format: 'woff2',
                    buffer: italicBuf,
                    weight,
                    style: 'italic'
                });
             }
        }
    }

    return assets;
};

export const generateFontFaceCSS = (assets: FontAsset[], relativePathPrefix: string): string => {
    return assets.map(asset => `
@font-face {
    font-family: '${asset.family}';
    font-style: ${asset.style};
    font-weight: ${asset.weight};
    src: url('${relativePathPrefix}${asset.filename}') format('${asset.format}');
}`).join('\n');
};
