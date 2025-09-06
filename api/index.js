// 1. Import necessary libraries
import express from 'express';
import fetch from 'node-fetch';
import FormData from 'form-data';
import 'dotenv/config';

// 2. Setup Express server
const app = express();
app.use(express.json());

// 3. Load secure keys and tokens from environment variables
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// 4. Define API URLs
const TEXT_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${GEMINI_API_KEY}`;
const IMAGE_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${GEMINI_API_KEY}`;

// 5. Setup Webhook Endpoint
// All requests will be routed here by Vercel

// GET request for Facebook verification
app.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
        console.log('WEBHOOK_VERIFIED');
        res.status(200).send(challenge);
    } else {
        res.sendStatus(403);
    }
});

// POST request to receive user messages
app.post('/webhook', (req, res) => {
    const body = req.body;
    if (body.object === 'page') {
        body.entry.forEach(entry => {
            const webhook_event = entry.messaging[0];
            if (webhook_event.sender && webhook_event.message) {
                 const sender_psid = webhook_event.sender.id;
                 handleMessage(sender_psid, webhook_event.message);
            }
        });
        res.status(200).send('EVENT_RECEIVED');
    } else {
        res.sendStatus(404);
    }
});


// 6. Main message handler function
async function handleMessage(sender_psid, received_message) {
    if (received_message.text) {
        const userText = received_message.text;
        const keywords = ['صورة', 'صور', 'رسم', 'ارسم', 'صمم', 'انشئ'];
        const isImageRequest = keywords.some(keyword => userText.toLowerCase().includes(keyword));

        if (isImageRequest) {
            await callSendAPI(sender_psid, { text: "فهمت طلبك، جارٍ إنشاء الصورة... 🎨" });
            await handleImageRequest(sender_psid, userText);
        } else {
            await handleTextRequest(sender_psid, userText);
        }
    }
}

// 7. Function to handle text generation via Gemini API
async function handleTextRequest(sender_psid, prompt) {
    try {
        const payload = { contents: [{ parts: [{ text: prompt }] }] };
        const response = await fetch(TEXT_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const result = await response.json();
        const botText = result?.candidates?.[0]?.content?.parts?.[0]?.text;
        await callSendAPI(sender_psid, { text: botText || "عذراً، لم أتمكن من معالجة الطلب." });
    } catch (error) {
        console.error('Text API Error:', error);
    }
}

// 8. Function to handle image generation and upload
async function handleImageRequest(sender_psid, prompt) {
    try {
        // Generate image from Imagen API
        const imagePayload = { instances: [{ prompt }], parameters: { "sampleCount": 1 } };
        const imageResponse = await fetch(IMAGE_API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(imagePayload) });
        const result = await imageResponse.json();
        const base64Data = result?.predictions?.[0]?.bytesBase64Encoded;

        if (!base64Data) {
            await callSendAPI(sender_psid, { text: "فشلت في إنشاء الصورة. حاول استخدام وصف مختلف." });
            return;
        }

        // Upload image to Facebook and send to user
        const imageBuffer = Buffer.from(base64Data, 'base64');
        const form = new FormData();
        form.append('recipient', JSON.stringify({ id: sender_psid }));
        form.append('message', JSON.stringify({ attachment: { type: 'image', payload: { is_reusable: false } } }));
        form.append('filedata', imageBuffer, { filename: 'image.png', contentType: 'image/png' });

        await fetch(`https://graph.facebook.com/v18.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, {
            method: 'POST',
            body: form,
            headers: form.getHeaders()
        });
    } catch (error) {
        console.error('Image Request/Upload Error:', error);
    }
}

// 9. Helper function to send text messages via Messenger API
async function callSendAPI(sender_psid, response) {
    const request_body = { "recipient": { "id": sender_psid }, "message": response };
    try {
        await fetch(`https://graph.facebook.com/v18.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(request_body)
        });
    } catch (error) {
        console.error("Unable to send message:", error);
    }
}

// Export the app for Vercel
export default app;

