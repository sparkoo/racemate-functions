import { onRequest, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";

import admin from "firebase-admin";
import { FileMetadata } from "@google-cloud/storage";
import { racemate } from "racemate-msg";
import { DocumentReference } from "firebase-admin/firestore";
import { db, LAP_COLLECTION } from "./index.js";

export const uploadFunction = onRequest(
  {
    region: ["europe-west3"],
  },
  async (req, res) => {
    // Check if user is authenticated
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      logger.warn("Authentication failed: No valid auth token provided");
      res.status(401).send("Unauthorized: Authentication required");
      return;
    }

    // Extract the token
    const idToken = authHeader.split("Bearer ")[1];

    let authUserId;
    try {
      // Verify the token
      authUserId = (await admin.auth().verifyIdToken(idToken)).uid;
      // Token is valid, user is authenticated
    } catch (error) {
      logger.warn("Authentication failed: Invalid token", error);
      res.status(401).send("Unauthorized: Invalid authentication token");
      return;
    }

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

    const filePath = `laps/${lap.player_name}_${lap.player_surname}/${lap.track}_${lap.car_model}/${lap.timestamp}.lap`;
    const metadata = await uploadFile(filePath, data);
    logger.log("file saved", metadata);

    const queryResult = await db
      .collection(LAP_COLLECTION)
      .where("fileFireStorage", "==", metadata.mediaLink)
      .get();
    if (queryResult.size == 0) {
      try {
        const docRef = await storeMetadata(filePath, lap, authUserId);
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
  filePath: string,
  lap: racemate.Lap,
  authUserId: string
): Promise<DocumentReference> => {
  const docRef = await db.collection(LAP_COLLECTION).add({
    storagePath: filePath,
    name: lap.player_name + " " + lap.player_surname,
    track: lap.track,
    laptime: lap.lap_time_ms,
    car: lap.car_model,
    timestamp: lap.timestamp,
    trackGrip: lap.track_grip_status,
    weather: lap.rain_intensity,
    airTemp: lap.air_temp,
    roadTemp: lap.road_temp,
    sessionType: lap.session_type,
    rainTypes: lap.rain_tyres,
    lapNumber: lap.lap_number,
    pollRate: lap.poll_rate,
    userId: authUserId,
  });
  logger.log("Document added", docRef);
  return docRef;
};
