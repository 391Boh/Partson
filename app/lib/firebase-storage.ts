import { getStorage } from "firebase/storage";
import { app } from "./firebase-app";
import "./firebase-auth";

export const storage = getStorage(app);
