import { Handler } from "@netlify/functions";

const handler: Handler = async (event, _context) => {
    // Only allow GET requests
    if (event.httpMethod !== "GET") {
        return {
            statusCode: 405,
            body: JSON.stringify({ error: "Method Not Allowed" })
        };
    }

    const { type, tab } = event.queryStringParameters || {};

    if (!type || !tab) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: "Missing type or tab parameter" })
        };
    }

    // Map type to environment variable
    let sheetId = "";
    switch (type) {
        case "main":
            sheetId = process.env.GOOGLE_SHEET_ID_MAIN || "1xmaLRjv7kbVjIdSlX0QiKzh2umRAGmLkia4LfYRT7aU";
            break;
        case "access":
            sheetId = process.env.GOOGLE_SHEET_ID_ACCESS || "1fSmujBzlFtu4ZTuTl5v2nUcFwL3uol3QFqRrzEUULEA";
            break;
        case "logo":
            sheetId = process.env.GOOGLE_SHEET_ID_LOGO || "1Y5_TXSIi2RFyd_uUMXcWLQTQ52Oy8kCwYZrnlj6a5Xk";
            break;
        default:
            return {
                statusCode: 400,
                body: JSON.stringify({ error: "Invalid sheet type" })
            };
    }

    if (!sheetId) {
        console.error(`Sheet ID for type ${type} is not configured.`);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Server configuration error" })
        };
    }

    const apiOrigin = process.env.VITE_API_ORIGIN || "https://bigou-sheets-api.netlify.app";
    const url = `${apiOrigin}/api/sheets/${sheetId}/${encodeURIComponent(tab)}`;

    console.log(`[Proxy] Fetching from Gateway: ${url}`);

    try {
        // Build request options, forwarding the Cookie header for httpOnly auth
        const fetchOptions: RequestInit = {
            method: "GET",
            headers: {
                "Cookie": event.headers.cookie || "",
                "Accept": "application/json",
            }
        };

        const response = await fetch(url, fetchOptions);

        if (!response.ok) {
            const errorText = await response.text();
            return {
                statusCode: response.status,
                body: JSON.stringify({
                    error: `A API do Bigou Gateway retornou erro ${response.status}`,
                    details: errorText,
                    tentativa: url
                })
            };
        }

        const data = await response.json();
        return {
            statusCode: 200,
            headers: {
                "Content-Type": "application/json",
                // Ensure cookies are passed back if any (though Gateway usually uses persistent cookies)
                "Access-Control-Allow-Credentials": "true",
            },
            body: JSON.stringify(data)
        };
    } catch (err: any) {
        console.error("[Proxy Error]", err);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Failed to proxy request", message: err.message })
        };
    }
};

export { handler };
