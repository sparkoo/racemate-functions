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
import { FileMetadata } from "@google-cloud/storage";
import { racemate } from "racemate-msg";
import { DocumentReference } from "firebase-admin/firestore";

let adminApp: admin.app.App;

if (admin.apps.length === 0) {
  adminApp = admin.initializeApp();
} else {
  adminApp = admin.app();
}

const db = adminApp.firestore();
const LAP_COLLECTION = "laps";

export const unauthorizedUpload = onRequest(
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
    const lap = racemate.Lap.deserialize(data);

    const filename = `laps/${lap.player_name}_${lap.player_surname}/${lap.track}_${lap.car_model}/${lap.timestamp}.lap`;
    const metadata = await uploadFile(filename, data);

    const queryResult = await db
      .collection(LAP_COLLECTION)
      .where("fileFireStorage", "==", metadata.mediaLink)
      .get();
    if (queryResult.size == 0) {
      try {
        const docRef = await storeMetadata(metadata, lap);
        logger.log("Document added", docRef);
        res.status(200).send(`Lap recorded: ${docRef}`);
      } catch (error) {
        logger.error("Error adding data:", error);
        throw new HttpsError("internal", "Error adding data to Firestore");
      }
    } else {
      logger.log("we already have this lap recorded");
      res.status(409).send("We already have this lap.");
    }
  }
);

const uploadFile = async (
  filename: string,
  data: Uint8Array
): Promise<FileMetadata> => {
  const bucket = admin.storage().bucket();
  const file = bucket.file(filename);
  const [fileExists] = await file.exists();
  if (!fileExists) {
    const writeStream = file.createWriteStream({
      metadata: {
        contentType: "application/octet-stream",
      },
    });
    writeStream.end(data);
    await new Promise<void>((resolve, reject) => {
      writeStream.on("finish", resolve);
      writeStream.on("error", reject);
    });
    logger.log("File saved", filename);
  } else {
    logger.log("file already there", filename);
  }
  const [metadata] = await file.getMetadata();
  logger.log("file metadata", metadata);
  return metadata;
};

const storeMetadata = async (
  metadata: FileMetadata,
  lap: racemate.Lap
): Promise<DocumentReference> => {
  const docRef = await db.collection(LAP_COLLECTION).add({
    fileFireStorage: metadata.mediaLink,
    name: lap.player_name + " " + lap.player_surname,
    track: lap.track,
    laptime: lap.lap_time_ms,
    car: lap.car_model,
    timestamp: lap.timestamp,
  });
  logger.log("Document added", docRef);
  return docRef;
};
