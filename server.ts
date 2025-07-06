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
  completePaymentAfterAuth,
} from "./open-payments"
import fs from 'fs'

const app = express()
const PORT = process.env.PORT || 3001

app.use(
  cors({
    origin: ["http://localhost:3000", "https://your-netlify-app.netlify.app", "https://*.netlify.app"],
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization", "X-API-Key"],
    credentials: true,
  }),
)

app.use(express.json({ limit: "10mb" }))
app.use(express.urlencoded({ extended: true }))
app.use(express.static(path.join(__dirname, "./public")))

app.get("/", (req: Request, res: Response): void => {
  res.sendFile(path.join(__dirname, "public", "index.html"))
})

app.get("/donate", (req: Request, res: Response): void => {
  res.sendFile(path.join(__dirname, "public", "donate-selection.html"))
})

app.get("/donate-person/:personId", (req: Request, res: Response): void => {
  res.sendFile(path.join(__dirname, "public", "donate-person.html"))
})

app.get("/upload", (req: Request, res: Response): void => {
  res.sendFile(path.join(__dirname, "public", "upload.html"))
})

app.get("/ngo-login", (req: Request, res: Response): void => {
  res.sendFile(path.join(__dirname, "public", "ngo-login.html"))
})

app.get("/ngo-dashboard", (req: Request, res: Response): void => {
  res.sendFile(path.join(__dirname, "public", "ngo-dashboard.html"))
})

app.get("/balances", (req: Request, res: Response): void => {
  res.sendFile(path.join(__dirname, "public", "balances.html"))
})

app.get("/api/health", (req: Request, res: Response) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
  })
})

app.post("/api/complete-payment", async (req: Request, res: Response): Promise<any> => {
  const { continueUri, continueAccessToken, interactRef, quoteId, senderWalletAddress, metadata } = req.body

  if (!continueUri || !continueAccessToken || !interactRef || !quoteId || !senderWalletAddress) {
    return res.status(400).json({
      error: "Validation failed",
      message: "continueUri, continueAccessToken, interactRef, quoteId, and senderWalletAddress are required",
      received: req.body,
    })
  }

  try {
    const client = await getAuthenticatedClient()
    const result = await completePaymentAfterAuth(client, {
      continueUri,
      continueAccessToken,
      interactRef,
      quoteId,
      senderWalletAddress,
      metadata,
    })

    if (metadata && metadata.homelessPersonId) {
      const amount = parseFloat(result.receiveAmount.value) / Math.pow(10, result.receiveAmount.assetScale)
      
      const people = readPeople()
      const person = people.find((p: any) => p.username === metadata.homelessPersonId)
      if (person) {
        person.balance = (person.balance || 0) + amount
        person.lastUpdated = new Date().toISOString()
        writePeople(people)
      }
    }

    return res.status(200).json({
      success: true,
      data: result,
      message: "Payment completed successfully",
    })
  } catch (err: any) {
    console.error("Error completing payment:", err)
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

app.post("/api/qpay-donation", async (req: Request, res: Response): Promise<any> => {
  const { receiverWallet, donorWallet, amount, redirectUrl, metadata, note } = req.body

  if (!receiverWallet || !donorWallet || !amount || !redirectUrl) {
    return res.status(400).json({
      error: "Validation failed",
      message: "receiverWallet, donorWallet, amount, and redirectUrl are required",
      received: req.body,
    })
  }

  try {
    const client = await getAuthenticatedClient()
    const result = await initiateQPayDonation(client, {
      receiverWallet,
      donorWallet,
      amount,
      redirectUrl,
      metadata,
      note,
    })

    return res.status(200).json({
      success: true,
      data: result,
      message: "Q-Pay donation flow initiated successfully. Store the payment details for completion after user authorization.",
    })
  } catch (err: any) {
    console.error("Error in Q-Pay donation:", err)
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
      },
      walletAddressDetails,
    )

    return res.status(200).json({ data: outgoingPaymentResponse })
  } catch (err: any) {
    console.error("Error creating outgoing payment:", err)
    return res.status(500).json({ error: "Failed to create outgoing payment" })
  }
})

app.get('/api/people', (req: Request, res: Response): void => {
  res.json({ success: true, data: readPeople() })
})

app.get('/api/people/:username', (req: Request, res: Response): void => {
  try {
    const { username } = req.params
    const people = readPeople()
    const person = people.find((p: any) => p.username === username)
    
    if (!person) {
      res.status(404).json({ error: 'Person not found' })
      return
    }
    
    res.json({ success: true, data: person })
  } catch (error) {
    console.error('Error getting person:', error)
    res.status(500).json({ error: 'Failed to get person' })
  }
})

app.post('/api/people', (req: Request, res: Response): void => {
  const { name, username, picture, description } = req.body
  if (!name || !username) {
    res.status(400).json({ error: 'Missing fields' })
    return
  }
  const people = readPeople()
  if (people.find((p: any) => p.username === username)) {
    res.status(400).json({ error: 'Username exists' })
    return
  }
  const newPerson = { 
    name, 
    username, 
    picture, 
    description, 
    balance: 0, 
    createdAt: new Date().toISOString(), 
    lastUpdated: new Date().toISOString() 
  }
  people.push(newPerson)
  writePeople(people)
  res.json({ success: true, data: newPerson })
})

app.delete('/api/people/:username', (req: Request, res: Response): void => {
  try {
    const { username } = req.params
    const people = readPeople()
    const personIndex = people.findIndex((p: any) => p.username === username)
    
    if (personIndex === -1) {
      res.status(404).json({ error: 'Person not found' })
      return
    }
    
    const deletedPerson = people.splice(personIndex, 1)[0]
    writePeople(people)
    
    res.json({ success: true, message: `Successfully deleted ${deletedPerson.name}` })
  } catch (error) {
    console.error('Error deleting person:', error)
    res.status(500).json({ error: 'Failed to delete person' })
  }
})

app.post("/api/withdraw", (req: Request, res: Response): void => {
  try {
    const { username, amount } = req.body
    
    if (!username || !amount) {
      res.status(400).json({ error: "username and amount are required" })
      return
    }
    
    const people = readPeople()
    const person = people.find((p: any) => p.username === username)
    if (!person) {
      res.status(404).json({ error: "Person not found" })
      return
    }
    if (person.balance < amount) {
      res.status(400).json({ error: "Insufficient balance" })
      return
    }
    person.balance -= amount
    person.lastUpdated = new Date().toISOString()
    writePeople(people)
    res.json({ success: true, data: person })
  } catch (error) {
    console.error("Error processing withdrawal:", error)
    res.status(500).json({ error: "Failed to process withdrawal" })
  }
})

app.use(express.static(path.join(__dirname, "public")));

app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: "Endpoint not found",
    message: `The endpoint ${req.method} ${req.originalUrl} does not exist`,
    availableEndpoints: [
      "GET /",
      "GET /donate",
      "GET /donate-person/:personId",
      "GET /upload",
      "POST /api/qpay-donation",
      "POST /api/complete-payment",
      "GET /api/people",
      "GET /api/people/:username",
      "POST /api/people",
      "DELETE /api/people/:username",
      "POST /api/withdraw",
      "POST /api/create-incoming-payment",
      "POST /api/create-quote",
      "POST /api/outgoing-payment-auth",
      "POST /api/outgoing-payment",
    ],
  })
})

app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error("Global Error Handler:", err)
  res.status(err.status || 500).json({
    error: "Internal Server Error",
    message: err.message || "Something went wrong",
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  })
})

app.listen(PORT, () => {
  console.log(`🚀 Express server running on http://localhost:${PORT}`)
})

const PEOPLE_FILE = path.join(__dirname, 'data/people.json')

function readPeople(): any[] {
  try { return JSON.parse(fs.readFileSync(PEOPLE_FILE, 'utf8')) } catch { return [] }
}
function writePeople(people: any[]): void {
  fs.writeFileSync(PEOPLE_FILE, JSON.stringify(people, null, 2))
}

export default app 