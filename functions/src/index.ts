/**
 * Import function triggers from their respective submodules:
 *
 * import {onCall} from "firebase-functions/v2/https";
 * import {onDocumentWritten} from "firebase-functions/v2/firestore";
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

import admin from "firebase-admin";
import { uploadFunction } from "./fnUpload.js";

let adminApp: admin.app.App;

if (admin.apps.length === 0) {
  adminApp = admin.initializeApp();
} else {
  adminApp = admin.app();
}

export const db = adminApp.firestore();
export const LAP_COLLECTION = "laps";

export const lapUpload = uploadFunction;
