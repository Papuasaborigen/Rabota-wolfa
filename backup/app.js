// ...existing code...
// Копия на 16.08.2025

// --- Firebase config ---

const firebaseConfig = {
  apiKey: "AIzaSyCXZFr0aODGn2fjeua4Rj1asWM5Y2aN47M",
  authDomain: "rabotanewolf-11947.firebaseapp.com",
  databaseURL: "https://rabotannewolf-11947-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "rabotannewolf-11947",
  storageBucket: "rabotannewolf-11947.firebasestorage.app",
  messagingSenderId: "295669160591",
  appId: "1:295669160591:web:3dc043f0480657b4ff2efa",
  measurementId: "G-7264GLF27X"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();

const DB_KEY = 'duty-assigner-state-v1';

function saveStateToCloud(state) {
  db.ref(DB_KEY).set(state);
}

function loadStateFromCloud(callback) {
  db.ref(DB_KEY).on('value', snapshot => {
    if (snapshot.exists()) {
      callback(snapshot.val());
    }
  });
}

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const storageKey = 'duty-assigner-state-v1';

/** @typedef {{ id:string, name:string, skill:number, startTime?:string, endTime?:string }} Employee */
/** @typedef {{ id:string, title:string, difficulty:number, excludedEmployeeIds?: string[], categoryId?: string | null }} Task */
/** @typedef {{ id:string, name:string, isHourly:boolean }} Category */

/** @type {{ employees: Employee[], tasks: Task[], weights: { skillPenalty:number, loadWeight:number } }} */

let state = {
  employees: [],
  tasks: [],
  weights: { skillPenalty: 10, loadWeight: 1, capacityPenalty: 6 },
  categories: [],
};

// ...existing code...
