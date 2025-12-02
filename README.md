# MineCheck - LoRa Firework Launch Control System

A production-grade web application to manage a mesh network of LoRa-based firework launch modules.

## System Architecture

### Components
- **Field Units (ATmega-8):** Single firework launchers with GPS and LoRa
- **Base Stations (NodeMCU/ESP8266):** Gateways that bridge LoRa and the Internet
- **Web Application:** Central command & control platform

## Tech Stack

### Backend
- Node.js + Express + TypeScript
- PostgreSQL + Prisma ORM
- JWT-based authentication

### Frontend
- React + Vite + TypeScript
- Tailwind CSS
- React-Leaflet (Map view)
- TanStack Query & Table

## Getting Started

### Prerequisites
- Node.js 18+ and npm
- PostgreSQL 14+

### Backend Setup

```bash
cd backend
npm install
cp .env.example .env
# Edit .env with your database credentials
npm run prisma:generate
npm run prisma:migrate
npm run dev
```

### Frontend Setup

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

**Note:** If you encounter PostCSS/Tailwind errors after pulling updates, try:
```bash
rm -rf node_modules
npm install
npm run dev
```

## Features

- User roles: MEGA_ADMIN, USER, GUEST
- Network management
- Device auto-discovery
- Real-time command queue
- Map and List dashboard views
- Remote diagnostics (Battery, GPS, Ping)
- Ignition control with permission checks

See full documentation in the problem statement.

## License

MIT
