# Q-Pay Donation Platform

A simple donation platform built with Q-Pay (Open Payments) that allows users to donate to homeless individuals and upload new users to the platform.

## Features

- **Welcome Page**: Landing page with options to make donations as a donor or log in as a NGO
- **Donation Selection**: Browse homeless individuals with their stories and photos
- **Individual Donation Pages**: Each person has their own donation page with personalized information
- **Upload User**: Add new homeless individuals to the platform
- **Q-Pay Integration**: Secure payment processing using Open Payments protocol
- **Responsive Design**: Works on desktop and mobile devices

## Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```
2. For custom usablility
   - Add your custom private key(replace with existing)
   - Add source wallet address and keyID to .env file
   - Add source wallet address and destination wallet address to ./public/app.js

3. Start the server:
   ```bash
   npm start
   ```
