# Architecture Refactor

## Split into Seperate Projects

- Split the Student/Admin Dashboard and Timeclock code into seperate projects within same repo
    - Student/Admin Dashboard
        - Views: Login, SetPass, Student Dashboard, Admin Dashboard
        - Components: all dialogs/modals, loading animations
        - Store: AppStore, DashboardStore, MgmtStore
    - Timeclock
        - Views: all from timeclock.html
        - Components: any dialogs/modals, loading animations
        - Store: TimeclockStore

## Use VueJS 3 JS Framework

- Refactor each web app to use Vue 3 instead of Alpine
- Stack:
    - Vue 3 / Vite: TypeScript, <script setup> component files
    - Pinia for state management
    - TailwindCSS
    - `axios` for api/network calls
    - ESLint and `tsconfig` files

>Note: Keep the UI / UX the same or as close to the same as it is currently implemented! Specifically, keep the Student/Admin Login & SetPass views the exact same UI design and keep the Timeclock pin login screen the same UI design.

## Build & Deploy

- Will still deploy by pushing commits to GitHub
- I want the Student/Admin Dashboard app to deploy to `dashboard.bscdecatur.com`
- I want the Timeclock app to deploy to `timeclock.bscdecatur.com`