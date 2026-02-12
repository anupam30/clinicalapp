import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { WebSocketServer } from "ws";
import WebSocket from "ws";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "deepgram-backend" });
});

// Endpoint to check if API key is configured
app.get("/api/deepgram/status", (req, res) => {
  const hasApiKey = !!process.env.DEEPGRAM_API_KEY;
  res.json({
    status: hasApiKey ? "configured" : "not-configured",
    message: hasApiKey ? "Deepgram API is ready" : "Deepgram API key not found"
  });
});

const PORT = process.env.PORT || 3002;

const server = app.listen(Number(PORT), '127.0.0.1', () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`WebSocket endpoint: ws://localhost:${PORT}`);
});

// WebSocket server for live transcription
const wss = new WebSocketServer({ server });

interface ActiveConnection {
  clientWs: WebSocket;
  deepgramWs: WebSocket | null;
  transcript: string;
}

const activeConnections = new Map<string, ActiveConnection>();

wss.on("connection", async (clientWs) => {
  const clientId = Date.now().toString();
  console.log(`[${clientId}] Client connected`);

  let deepgramWs: WebSocket | null = null;

  try {
    const apiKey = process.env.DEEPGRAM_API_KEY;
    if (!apiKey) {
      throw new Error("DEEPGRAM_API_KEY not configured");
    }

    // Direct WebSocket connection to Deepgram API
    // We send raw linear16 PCM at 16000Hz from the browser, so tell Deepgram the encoding and sample rate.
    // Do not force a single language so Deepgram can auto-detect mixed Hindi/English (Hinglish).
    // Let Deepgram auto-detect language (for Hinglish), enable diarization and punctuation
    const deepgramUrl = `wss://api.deepgram.com/v1/listen?model=nova-2&encoding=linear16&sample_rate=16000&language=auto&diarize=true&punctuate=true&interim_results=true&smart_format=true`;

    console.log(`[${clientId}] Connecting to Deepgram API...`);
    
    deepgramWs = new WebSocket(deepgramUrl, {
      headers: {
        Authorization: `Token ${apiKey}`,
      },
    });

    let fullTranscript = "";

    deepgramWs.on("open", () => {
      console.log(`[${clientId}] Connected to Deepgram API`);
      clientWs.send(JSON.stringify({
        type: "connected",
        clientId,
        message: "Connected to Deepgram speech-to-text service",
      }));
    });

    deepgramWs.on("message", (data) => {
      try {
        const message = JSON.parse(data.toString());
        
        // Handle transcript events
        if (message.type === "Results") {
          const transcript = message.channel?.alternatives?.[0]?.transcript || "";
          const isFinal = message.is_final === true;

          if (transcript) {
            if (!isFinal) {
              fullTranscript += transcript + " ";
            }

            console.log(`[${clientId}] Transcript: "${transcript}" (final: ${isFinal})`);
            clientWs.send(JSON.stringify({
              type: "transcript",
              text: transcript,
              isFinal,
              timestamp: new Date().toISOString(),
            }));
          }
        }

        // Handle metadata
        if (message.type === "Metadata") {
          console.log(`[${clientId}] Metadata received`);
        }
      } catch (error) {
        console.error(`[${clientId}] Error parsing message:`, error);
      }
    });

    deepgramWs.on("error", (error) => {
      console.error(`[${clientId}] Deepgram API error:`, error);
      clientWs.send(JSON.stringify({
        type: "error",
        message: `Deepgram API error: ${error.message}`,
      }));
    });

    deepgramWs.on("close", () => {
      console.log(`[${clientId}] Deepgram connection closed`);
    });

    // Store active connection
    activeConnections.set(clientId, {
      clientWs,
      deepgramWs,
      transcript: fullTranscript,
    });

    // Handle incoming audio data from client
    clientWs.on("message", (message) => {
      if (deepgramWs && deepgramWs.readyState === WebSocket.OPEN) {
        if (typeof message === "string") {
          const data = JSON.parse(message);
          if (data.type === "audio" && data.audio) {
            // Send the audio buffer
            deepgramWs.send(data.audio);
          }
        } else {
          // Binary audio data - send directly to Deepgram
          deepgramWs.send(message);
        }
      }
    });

    // Handle client disconnect
    clientWs.on("close", () => {
      console.log(`[${clientId}] Client disconnected`);
      if (deepgramWs && deepgramWs.readyState === WebSocket.OPEN) {
        deepgramWs.close();
      }
      activeConnections.delete(clientId);
    });

    clientWs.on("error", (error) => {
      console.error(`[${clientId}] Client WebSocket error:`, error);
      if (deepgramWs && deepgramWs.readyState === WebSocket.OPEN) {
        deepgramWs.close();
      }
    });
  } catch (error: any) {
    console.error(`[${clientId}] Connection error:`, error.message);
    clientWs.send(JSON.stringify({
      type: "error",
      message: error.message || "Failed to connect to Deepgram",
    }));
    clientWs.close();
  }
});

// Endpoint to get active connections (for debugging)
app.get("/api/connections", (req, res) => {
  res.json({
    activeConnections: activeConnections.size,
    clients: Array.from(activeConnections.keys()),
  });
});

// Endpoint to mint ephemeral Deepgram token for direct browser-to-Deepgram streaming
app.post("/api/deepgram/token", async (req, res) => {
  try {
    const apiKey = process.env.DEEPGRAM_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Deepgram API key not configured" });
    }

    // Call Deepgram API to get an ephemeral token (valid for ~10 minutes)
    const response = await fetch("https://api.deepgram.com/v1/tokens", {
      method: "POST",
      headers: {
        Authorization: `Token ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        scopes: ["listen"],
        expires_in: 600, // 10 minutes
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("[Deepgram token] Failed:", err);
      return res.status(500).json({ error: "Failed to mint Deepgram token" });
    }

    const data: any = await response.json();
    res.json({ token: data.token });
  } catch (error: any) {
    console.error("[Deepgram token] Error:", error);
    res.status(500).json({ error: error.message || "Token generation failed" });
  }
});

// Endpoint to mint ephemeral AssemblyAI token for direct browser-to-AssemblyAI streaming
// Endpoint to validate and return AssemblyAI API key for direct browser connection
app.post("/api/assemblyai/token", async (req, res) => {
  try {
    const apiKey = process.env.ASSEMBLYAI_API_KEY;
    if (!apiKey) {
      console.error("[AssemblyAI token] API key not configured");
      return res.status(500).json({ error: "AssemblyAI API key not configured" });
    }

    console.log("[AssemblyAI token] Validating AssemblyAI API key...");

    // Verify the API key by calling AssemblyAI API
    const response = await fetch("https://api.assemblyai.com/v1/account", {
      method: "GET",
      headers: {
        "Authorization": apiKey,
      },
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("[AssemblyAI token] Validation failed:", response.status, err);
      return res.status(500).json({ 
        error: "AssemblyAI API key invalid or expired", 
        status: response.status
      });
    }

    console.log("[AssemblyAI token] API key validated successfully");
    // Return a success response with connection info
    res.json({ 
      token: apiKey,  // Return the API key for the frontend to use
      ready: true 
    });
  } catch (error: any) {
    console.error("[AssemblyAI token] Exception:", error.message);
    res.status(500).json({ error: error.message || "Validation failed" });
  }
});
