// Public Firebase web configuration; never place Admin credentials here.
export const firebaseConfig = {
  apiKey: "AIzaSyCEn_wd-0nIDtg8U4I3kt7o17MTg8Olai0",
  authDomain: "storybranch-f77a3.firebaseapp.com",
  projectId: "storybranch-f77a3",
  storageBucket: "storybranch-f77a3.firebasestorage.app",
  messagingSenderId: "75646560281",
  appId: "1:75646560281:web:4892628f2dc298a2762288",
  measurementId: "G-JBFN1VZ45F",
};
// Production serves Firebase's sign-in handler from its own domain
// (vercel.json proxies /__/auth/), so browsers that block third-party
// storage, like every iPhone browser, keep the sign-in state. Other hosts
// (local, previews) use the firebaseapp.com handler.
export const ownAuthDomain = "www.storybranch.com";
