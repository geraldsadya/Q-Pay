// ===== UPDATED server.js =====

import express, { type Request, type Response, type NextFunction } from "express"
import cors from "cors"
import path from "path"
import {
  createIncomingPayment,
  createOutgoingPayment,
  createQuote,
  getAuthenticatedClient,
  createOutgoingPaymentPendingGrant,
  getWalletAddressInfo,
  initiateQPayDonation,
  completePaymentAfterAuth, // ✅ NEW: Import the completion function
} from "./open-payments"

// Initialize express app
const app = express()
const PORT = process.env.PORT || 3001

// Middleware
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization", "X-API-Key"],
  }),
)

app.use(express.json({ limit: "10mb" }))
app.use(express.urlencoded({ extended: true }))
app.use(express.static(path.join(__dirname, "./public")))

// Root endpoint
app.get("/", (_, res) => res.sendFile(path.join(__dirname, "public", "index.html")))

// Donation selection page
app.get("/donate", (_, res) => res.sendFile(path.join(__dirname, "public", "donate-selection.html")))

// Individual donation page
app.get("/donate-person/:personId", (_, res) => res.sendFile(path.join(__dirname, "public", "donate-person.html")))

// Upload page (placeholder for now)
app.get("/upload", (_, res) => res.sendFile(path.join(__dirname, "public", "upload.html")))

// Health check endpoint
app.get("/api/health", (req: Request, res: Response) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
  })
})

// ✅ NEW: Payment completion endpoint - THIS WAS MISSING!
app.post("/api/complete-payment", async (req: Request, res: Response): Promise<any> => {
  const { continueUri, continueAccessToken, interactRef, quoteId, senderWalletAddress, metadata } = req.body

  console.log("=== Complete Payment Debug ===")
  console.log("Request body:", JSON.stringify(req.body, null, 2))

  // Basic validation
  if (!continueUri || !continueAccessToken || !interactRef || !quoteId || !senderWalletAddress) {
    console.log("❌ Validation failed - missing required fields")
    return res.status(400).json({
      error: "Validation failed",
      message: "continueUri, continueAccessToken, interactRef, quoteId, and senderWalletAddress are required",
      received: req.body,
    })
  }

  try {
    console.log("Step 1: Creating authenticated client...")
    const client = await getAuthenticatedClient()

    console.log("Step 2: Completing payment after authorization...")
    const result = await completePaymentAfterAuth(client, {
      continueUri,
      continueAccessToken,
      interactRef,
      quoteId,
      senderWalletAddress,
      metadata,
    })

    console.log("✅ Payment completed successfully")
    console.log("Result:", JSON.stringify(result, null, 2))

    return res.status(200).json({
      success: true,
      data: result,
      message: "Payment completed successfully",
    })
  } catch (err: any) {
    console.error("❌ Error completing payment:")
    console.error("Error details:", err)

    return res.status(500).json({
      error: "Failed to complete payment",
      message: err.message,
      details: {
        name: err.name,
        status: err.status,
        code: err.code,
        description: err.description,
      },
    })
  }
})

// ✅ UPDATED: Q-Pay donation endpoint 
app.post("/api/qpay-donation", async (req: Request, res: Response): Promise<any> => {
  const { receiverWallet, donorWallet, amount, redirectUrl, metadata, note } = req.body

  console.log("=== Q-Pay Donation Debug ===")
  console.log("Request body:", JSON.stringify(req.body, null, 2))

  // Basic validation
  if (!receiverWallet || !donorWallet || !amount || !redirectUrl) {
    console.log("❌ Validation failed - missing required fields")
    return res.status(400).json({
      error: "Validation failed",
      message: "receiverWallet, donorWallet, amount, and redirectUrl are required",
      received: req.body,
    })
  }

  try {
    console.log("Step 1: Creating authenticated client...")
    const client = await getAuthenticatedClient()
    console.log("✅ Authenticated client created successfully")

    console.log("Step 2: Initiating Q-Pay donation...")
    const result = await initiateQPayDonation(client, {
      receiverWallet,
      donorWallet,
      amount,
      redirectUrl,
      metadata,
      note,
    })

    console.log("✅ Q-Pay donation initiated successfully")

    return res.status(200).json({
      success: true,
      data: result,
      message: "Q-Pay donation flow initiated successfully. Store the payment details for completion after user authorization.",
    })
  } catch (err: any) {
    console.error("❌ Detailed error in Q-Pay donation:")
    console.error("Full error object:", JSON.stringify(err, null, 2))

    return res.status(500).json({
      error: "Failed to initiate Q-Pay donation",
      message: err.message,
      details: {
        name: err.name,
        status: err.status,
        code: err.code,
        description: err.description,
      },
    })
  }
})

// Rest of your existing endpoints...
app.post("/api/create-incoming-payment", async (req: Request, res: Response): Promise<any> => {
  const { senderWalletAddress, receiverWalletAddress, amount, metadata } = req.body

  if (!senderWalletAddress || !receiverWalletAddress || !amount) {
    return res.status(400).json({
      error: "Validation failed",
      message: "Please fill in all the required fields",
      received: req.body,
    })
  }

  try {
    const client = await getAuthenticatedClient()
    const { walletAddressDetails } = await getWalletAddressInfo(client, receiverWalletAddress)
    const incomingPayment = await createIncomingPayment(client, amount, walletAddressDetails, metadata)
    return res.status(200).json({ data: incomingPayment })
  } catch (err: any) {
    console.error("Error creating incoming payment:", err)
    return res.status(500).json({ error: "Failed to create incoming payment" })
  }
})

app.post("/api/create-quote", async (req: Request, res: Response): Promise<any> => {
  const { senderWalletAddress, incomingPaymentUrl, debitAmount } = req.body

  if (!senderWalletAddress || !incomingPaymentUrl) {
    return res.status(400).json({
      error: "Validation failed",
      message: "Please fill in all the required fields",
      received: req.body,
    })
  }

  try {
    const client = await getAuthenticatedClient()
    const { walletAddressDetails } = await getWalletAddressInfo(client, senderWalletAddress)
    const quote = await createQuote(client, incomingPaymentUrl, walletAddressDetails, debitAmount)
    return res.status(200).json({ data: quote })
  } catch (err: any) {
    console.error("Error creating quote:", err)
    return res.status(500).json({ error: "Failed to create quote" })
  }
})

app.post("/api/outgoing-payment-auth", async (req: Request, res: Response): Promise<any> => {
  const { senderWalletAddress, quoteId, debitAmount, receiveAmount, redirectUrl } = req.body

  if (!senderWalletAddress || !quoteId) {
    return res.status(400).json({
      error: "Validation failed",
      message: "Please fill in all the required fields",
      received: req.body,
    })
  }

  try {
    const client = await getAuthenticatedClient()
    const { walletAddressDetails } = await getWalletAddressInfo(client, senderWalletAddress)

    const outgoingPaymentAuthResponse = await createOutgoingPaymentPendingGrant(
      client,
      {
        quoteId,
        debitAmount,
        receiveAmount,
        redirectUrl,
      },
      walletAddressDetails,
    )
    return res.status(200).json({ data: outgoingPaymentAuthResponse })
  } catch (err: any) {
    console.error("Error creating outgoing payment auth:", err)
    return res.status(500).json({ error: "Failed to create outgoing payment auth" })
  }
})

app.post("/api/outgoing-payment", async (req: Request, res: Response): Promise<any> => {
  const {
    senderWalletAddress,
    continueAccessToken,
    quoteId,
    interactRef,
    continueUri,
    metadata,
  } = req.body

  if (!senderWalletAddress || !quoteId) {
    return res.status(400).json({
      error: "Validation failed",
      message: "Please fill in all the required fields",
      received: req.body,
    })
  }

  try {
    const client = await getAuthenticatedClient()
    const { walletAddressDetails } = await getWalletAddressInfo(client, senderWalletAddress)

    const outgoingPaymentResponse = await createOutgoingPayment(
      client,
      {
        continueAccessToken,
        quoteId,
        interactRef,
        continueUri,
        metadata,
      }, // ✅ FIXED: Removed senderWalletAddress from here
      walletAddressDetails,
    )

    return res.status(200).json({ data: outgoingPaymentResponse })
  } catch (err: any) {
    console.error("Error creating outgoing payment:", err)
    return res.status(500).json({ error: "Failed to create outgoing payment" })
  }
})

// ============== ERROR HANDLING ==============

// 404 (catch-all)
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: "Endpoint not found",
    message: `The endpoint ${req.method} ${req.originalUrl} does not exist`,
    availableEndpoints: [
      "GET /",
      "POST /api/qpay-donation",
      "POST /api/complete-payment", // ✅ NEW
      "POST /api/create-incoming-payment",
      "POST /api/create-quote",
      "POST /api/outgoing-payment-auth",
      "POST /api/outgoing-payment",
    ],
  })
})

// Global error handler
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error("Global Error Handler:")
  console.error("Error name:", err.name)
  console.error("Error message:", err.message)
  console.error("Error stack:", err.stack)

  res.status(err.status || 500).json({
    error: "Internal Server Error",
    message: err.message || "Something went wrong",
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  })
})

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Express server running on http://localhost:${PORT}`)
  console.log(`🏥 Health check: http://localhost:${PORT}/api/health`)
  console.log("\n📋 Available endpoints:")
  console.log("  POST   /api/qpay-donation            - 🆕 Q-Pay: Complete QR-triggered donation flow")
  console.log("  POST   /api/complete-payment         - 🆕 Complete payment after user authorization")
  console.log("  POST   /api/create-incoming-payment  - Create incoming payment resource")
  console.log("  POST   /api/create-quote             - Create quote resource")
  console.log("  POST   /api/outgoing-payment-auth    - Get continuation grant for outgoing payment")
  console.log("  POST   /api/outgoing-payment         - Create outgoing payment resource")
})

export default app