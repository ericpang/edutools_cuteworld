# Project Name: ClassQuest / Virtual Classroom Grid (Real-Time Interactive Virtual Environment)

## 1. Project Overview
A lightweight, real-time virtual classroom web application where students use their mobile phones to join via a QR code, enter their name, select a **male or female persona**, and navigate a 2D grid environment overlaid on selectable **environment maps (School, Jungle, Shopping Center)** using a **virtual joystick**. When avatars bump into one another, cute proximity sound effects trigger. Students can chat with peers via a dedicated chat button (1-on-1 or group) and participate in admin-triggered quizzes (individual or auto-assigned groups).

The application is designed to be hosted on **GitHub Pages** using static assets (**HTML, CSS, JavaScript**), leveraging **Firebase (Realtime Database / Firestore)** for zero-server real-time state synchronization, positioning, and chat.

---

## 2. Target Tech Stack & Hosting
* **Frontend:** Vanilla HTML5, CSS3, JavaScript (ES6 Modules), Canvas API or CSS-based absolute positioning over background map images.
* **Joystick Library:** `nipplejs` (via CDN) or lightweight vanilla touch joystick implementation for smooth mobile navigation.
* **Audio:** Web Audio API or lightweight HTML5 audio synthesis for cute collision/bump sound effects.
* **Backend / Realtime State:** Firebase (Firestore or Realtime Database + Anonymous Auth) for real-time player positioning, chat, and admin state management.
* **Hosting:** GitHub Pages (Static frontend hosting).
* **Auxiliary Libraries:** `qrcode.min.js` (for generating the join QR code on the admin/big screen), Tailwind CSS (via CDN) for rapid UI styling.

---

## 3. Core Roles & User Flows

### A. Admin / Big Screen Mode (`admin.html`)
* **Session Initialization & Environment Selection:** 
  * Generates a unique Room/Session ID and displays a dynamic **QR Code** pointing to the student join URL (`student.html?room=SESSION_ID`).
  * **Environment Map Switcher:** Admin selects from **3 pre-created background environment themes**: 
    1. `School` 🏫
    2. `Jungle` 🌴
    3. `Shopping Center` 🏬
  * Changing the environment instantly syncs the background map across all connected student devices via Firebase.
* **Live Map Visualization:** A large 2D grid/canvas showing all connected student avatars moving smoothly in real-time over the chosen environment map.
* **Admin Inspection:** Clicking on any character avatar opens a modal showing:
  * Student Name, Persona (Male/Female avatar icon).
  * Who they are currently chatting with (1-on-1 or group).
  * Live transcripts of their recent chat conversations.
* **Question & Quiz Trigger:** An admin control panel to publish a question or quiz prompt, choosing whether students answer **individually** or are **auto-assigned into groups**.
* **Monitoring:** View real-time quiz submission statuses across individuals/groups.

### B. Student / Mobile Mode (`student.html`)
* **Onboarding & Persona Setup:** 
  * Scans the QR code to enter the room.
  * Inputs their **Name**.
  * Selects their character persona (**Male** or **Female** avatar representation).
* **Virtual Joystick & Navigation:** 
  * Features a touch-friendly **Virtual Joystick** (using `nipplejs` or custom touch events) on the mobile screen to fluidly navigate up, down, left, and right across the map.
  * Client-side collision detection stops characters from walking off-screen or through environmental boundaries.
* **Proximity & Bump Feedback:** 
  * When a student's avatar hitbox collides/bumps into another player's persona, a **cute audio sound effect** plays instantly on their device, and a visual sparkle/bump effect appears.
* **Dedicated Chat Button & Proximity Direct Chat:** 
  * A prominent **Chat Button** on the mobile UI allows students to open a dialogue panel, tap nearby characters to start 1-on-1 chats, or participate in assigned group channels.
* **Interactive Challenges:** When the admin triggers a question, a modal pops up on their phone allowing them to submit answers individually or collaboratively with their auto-assigned group.

---

## 4. Key Features & Functional Requirements

1. **Environment Map State Sync:** Selected environment (School, Jungle, Shopping Center) syncs via Firebase to render identical backgrounds across the projector and all mobile phones.
2. **Virtual Joystick Movement:** Fluid mobile steering replacing static buttons, broadcasting coordinate/velocity updates to Firebase at optimized throttled intervals.
3. **Collision Sound Effects:** Client-side spatial or localized trigger checking player-to-player Euclidean distance; plays a short, pleasant "boop" or "pop" sound effect upon contact.
4. **Persona & Customization State:** Student name and gender/persona choice are saved to their player profile object in Firebase.
5. **Auto-Grouping & Admin Surveillance:** Administrative god-mode tools to shard students into balanced teams and review active conversation logs.

---

## 5. Suggested File Structure
```text
/
├── index.html          # Landing / Role Selection (Admin vs. Student)
├── admin.html          # Big screen dashboard, map view, environment selector, admin controls
├── student.html        # Onboarding, virtual joystick container, chat panel, and quiz modal
├── css/
│   └── style.css       # Custom styles, joystick placement, animations, grid layouts
├── js/
│   └── firebase-config.js # Firebase initialization and credentials
│   └── admin.js        # Admin canvas rendering, QR generation, map switching, state listeners
│   └── student.js      # Onboarding handlers, nipplejs joystick logic, collision sound synthesizer, chat/quiz UI
└── assets/
    ├── maps/           # Background images for school.jpg, jungle.jpg, shopping.jpg
    ├── avatars/        # Male and female character sprite/icon assets
    └── audio/          # Cute bump/pop sound effect file (bump.mp3) or Web Audio API synthesizer