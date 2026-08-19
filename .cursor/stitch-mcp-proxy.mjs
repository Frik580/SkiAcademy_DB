import { createInterface } from "node:readline";
import https from "node:https";

const apiKey = process.env.STITCH_API_KEY;
const endpoint = new URL("https://stitch.googleapis.com/mcp");

if (!apiKey) {
  console.error("STITCH_API_KEY is missing");
  process.exit(1);
}

function callStitch(message) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(message);

    const req = https.request(
      {
        hostname: endpoint.hostname,
        path: endpoint.pathname,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
          "X-Goog-Api-Key": apiKey
        }
      },
      res => {
        let data = "";

        res.on("data", chunk => {
          data += chunk;
        });

        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch (error) {
            reject(error);
          }
        });
      }
    );

    req.on("error", reject);
    req.end(body);
  });
}

const input = createInterface({
  input: process.stdin,
  terminal: false
});

input.on("line", async line => {
  if (!line.trim()) return;

  try {
    const request = JSON.parse(line);

    if (request.id === undefined) {
      callStitch(request).catch(() => {});
      return;
    }

    const response = await callStitch(request);

    if (request.method === "tools/list" && response?.result?.tools) {
      response.result.tools = response.result.tools.map(tool => {
        const { outputSchema, ...rest } = tool;
        return rest;
      });
    }

    process.stdout.write(JSON.stringify(response) + "\n");
  } catch (error) {
    console.error(error);
  }
});