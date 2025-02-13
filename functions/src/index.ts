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
import { racemate } from "racemate-msg";


let adminApp: admin.app.App;

if (admin.apps.length === 0) {
  adminApp = admin.initializeApp();
} else {
  adminApp = admin.app();
}

const db = adminApp.firestore();

export const hello = onRequest(
  {
    region: ["europe-west3"],
  },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(403).send("Forbidden, accepting only POST request.");
      return;
    }

    if (req.headers["content-encoding"] !== "gzip") {
      res.status(400).send("Forbidden, accepting only 'gzip' content.");
      return;
    }

    // For some reason, even if we're sending gzipped data, it comes uncompressed here
    const data = new Uint8Array(req.rawBody);

    const bucket = admin.storage().bucket();
    const file = bucket.file(Date.now().toString() + ".dataa");
    const writeStream = await file.createWriteStream({
      metadata: {
        contentType: "application/octet-stream",
      },
    });
    writeStream.end(data);
    await new Promise<void>((resolve, reject) => {
      writeStream.on("finish", resolve);
      writeStream.on("error", reject);
    });
    const [metadata] = await file.getMetadata();
    logger.log("File saved: ", metadata);

    const lap = racemate.Lap.deserialize(data);
    try {
      const docRef = await db.collection("laps").add({
        fileFireStorage: metadata.mediaLink,
        name: lap.player_name + " " + lap.player_surname,
        track: lap.track,
        laptime: lap.lap_time_ms,
        car: lap.car_model,
        timestamp: lap.timestamp
      });
      logger.log("Document added", docRef);
      res.status(200).send(`Document added: ${docRef}`);
    } catch (error) {
      logger.error("Error adding data:", error);
      throw new HttpsError("internal", "Error adding data to Firestore");
    }
    logger.log(4);
  }
);
