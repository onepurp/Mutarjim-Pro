# Mutarjim Pro

Mutarjim Pro is an application designed to translate EPUB books from English to Arabic using Google's Gemini models. It focuses on preserving the structural integrity of the EPUB file (HTML tags, classes, and layout) while providing high-quality literary translation.

![App Screenshot](https://files.catbox.moe/pasyiu.png
)

This application is a client-side React application.

*   our EPUB files are processed locally in your browser. They are not uploaded to a simplified intermediate server. The text is sent directly from your browser to the Google Gemini API.
*   You must configure your Google Gemini API key in the environment variables. The application uses this key to authenticate requests.

## Technical Approach & Quota Management

Translating entire books via LLMs presents specific challenges regarding API rate limits and context windows. This application uses a specific architectural approach to handle these constraints effectively.

### Segmentation and Batching
The Google Gemini API enforces limits on both Requests Per Minute (RPM) and Tokens Per Minute (TPM).
1.  **Granularity:** Sending a book sentence-by-sentence generates too many network requests, quickly hitting the RPM limit (Requests Per Minute).
2.  **Context Window:** Sending a whole chapter or book often exceeds the output token limit or results in timeouts.

**The Solution:**
Mutarjim Pro parses the EPUB file and intelligently groups HTML blocks into "segments" of approximately 6000 characters. This size is optimized to:
*   Maximize the utility of each API call (reducing total request count).
*   Fit comfortably within standard output token limits.
*   Provide enough context for the AI to understand the narrative flow.

### Queue System
The application implements a sequential processing queue stored in IndexedDB.
*   **Sequential Processing:** Segments are translated one by one. This ensures we do not flood the API with concurrent requests.
*   **Error Handling:** If the API returns a 429 (Too Many Requests) error, the system detects it, pauses the queue, and waits before retrying.
*   **Persistence:** Because state is saved to the browser's local database, you can close the tab or refresh without losing progress.


## Setup Instructions

1.  Install dependencies:
    ```bash
    npm install
    ```

2.  Configure Environment:
    Create a `.env.local` file and add your API key:
    ```
    GEMINI_API_KEY=your_api_key_here
    ```

3.  Run the development server:
    ```bash
    npm run dev
    ```

## Features

*   **HTML-Aware Translation:** Uses specialized system instructions to ensure the AI translates text content while strictly preserving HTML tags and attributes.
*   **Visual Split-View:** Compare the original English text side-by-side with the generated Arabic translation.
*   **Backup & Restore:** Export your progress to a `.mtj` file to move between devices or browsers.
*   **EPUB Reassembly:** Generates a valid, translated EPUB file ready for e-readers.


## License

[MIT](https://choosealicense.com/licenses/mit/)

