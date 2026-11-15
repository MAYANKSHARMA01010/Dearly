# Dearly Frontend (React Native + Expo)

Empty React Native project built with **Expo SDK 58**, **React Native Paper**, and **Tailwind CSS (NativeWind v4)**.

---

## 📁 Folder Structure

```text
frontend/
├── App.js                     # Root entry point (Clean starter with PaperProvider)
├── global.css                 # Tailwind CSS directives
├── tailwind.config.js         # NativeWind & Tailwind configuration
├── metro.config.js            # Metro bundler with NativeWind
├── babel.config.js            # Babel preset & reanimated/worklets plugins
├── jsconfig.json              # Path aliases (@/* -> ./src/*)
├── nativewind-env.d.ts        # NativeWind TypeScript declaration
├── .env.example               # Environment variables template
└── src/
    ├── api/                   # API client and endpoints (.gitkeep)
    ├── assets/                # Assets subdirectories:
    │   ├── animations/        # Lottie / animations (.gitkeep)
    │   ├── fonts/             # Custom fonts (.gitkeep)
    │   ├── icons/             # Custom icon assets (.gitkeep)
    │   └── images/            # Static image files (.gitkeep)
    ├── components/            # UI components subdirectories:
    │   ├── common/            # Shared / reusable widgets (.gitkeep)
    │   ├── forms/             # Form elements (.gitkeep)
    │   ├── layout/            # Layout wrappers (.gitkeep)
    │   └── platform/          # Platform specific UI (.gitkeep)
    ├── config/                # App constants and configuration (.gitkeep)
    ├── context/               # React Context state providers (.gitkeep)
    ├── hooks/                 # Custom React hooks (.gitkeep)
    ├── navigation/            # Navigation stacks and tabs (.gitkeep)
    ├── screens/               # Screen modules:
    │   ├── auth/              # Auth screens (.gitkeep)
    │   ├── home/              # Main screens (.gitkeep)
    │   └── profile/           # Profile screens (.gitkeep)
    ├── services/              # External services and storage (.gitkeep)
    ├── theme/                 # Design tokens and themes (.gitkeep)
    └── utils/                 # Utility functions (.gitkeep)
```

---

## 🚀 Running the Project

```bash
cd frontend
npm start
```
