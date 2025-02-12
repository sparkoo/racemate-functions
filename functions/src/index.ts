/**
 * Import function triggers from their respective submodules:
 *
 * import {onCall} from "firebase-functions/v2/https";
 * import {onDocumentWritten} from "firebase-functions/v2/firestore";
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

import { onRequest, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";

import admin from "firebase-admin";
import * as zlib from "zlib";
import { racemate } from "racemate-msg";
import { promisify } from "util";

// Start writing functions
// https://firebase.google.com/docs/functions/typescript

// export const helloWorld = onRequest((request, response) => {
//   logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
// });

let adminApp: admin.app.App; // Declare a variable to hold the app instance

if (admin.apps.length === 0) {
  // Check if already initialized
  adminApp = admin.initializeApp();
} else {
  adminApp = admin.app(); // Get the already initialized app
}

// Now use adminApp to access Firestore, etc.
const db = adminApp.firestore();

const gunzipAsync = promisify(zlib.gunzip);

export const hello = onRequest(
  {
    region: ["europe-west3"],
  },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(403).send("Forbidden, accepting only POST request.");
      return
    }

    if (req.headers["content-encoding"] !== "gzip") {
      res.status(400).send("Forbidden, accepting only 'gzip' content.");
      return
    }

    const body = Buffer.from(req.body)

    const bucket = admin.storage().bucket();
    const file = bucket.file(Date.now().toString() + ".dataa");
    const writeStream = await file.createWriteStream({
      metadata: {
        contentType: "application/octet-stream",
      },
    });
    writeStream.end(body);
    await new Promise<void>((resolve, reject) => {
      writeStream.on("finish", resolve);
      writeStream.on("error", reject);
    });
    const [metadata] = await file.getMetadata();

    // this probably fails because 'body' is not in correct binary gzip format
    const decompressedData = await gunzipAsync(body);
    const data = new Uint8Array(decompressedData);
    const lap = racemate.Lap.deserialize(data);
    try {
      const docRef = await db
        .collection("laps")
        .add({
          fileFireStorage: metadata.mediaLink,
          name: lap.player_name + " " + lap.player_surname,
          track: lap.track,
          laptime: lap.lap_time_ms,
          car: lap.car_model
        });
      logger.log("Document added", docRef);
      res.status(200).send(`Document added: ${docRef}`);
      // return { message: 'Data added successfully!', id: docRef.id };
    } catch (error) {
      logger.error("Error adding data:", error);
      throw new HttpsError("internal", "Error adding data to Firestore");
    }
  }
);
