// ===== UPDATED open-payments.js - Fixed Payment Completion =====

import dotenv from "dotenv"
import {
  createAuthenticatedClient,
  type AuthenticatedClient,
  type WalletAddress,
  type OutgoingPayment,
  type Quote,
  type IncomingPayment,
  isPendingGrant,
} from "@interledger/open-payments"
import crypto from "crypto"

dotenv.config()

export async function getAuthenticatedClient() {
  let walletAddress = process.env.OPEN_PAYMENTS_CLIENT_ADDRESS

  if (walletAddress && walletAddress.startsWith("$")) {
    walletAddress = walletAddress.replace("$", "https://")
  }

  console.log("Creating authenticated client with:")
  console.log("- Wallet Address:", walletAddress)
  console.log("- Key ID:", process.env.OPEN_PAYMENTS_KEY_ID)

  const client = await createAuthenticatedClient({
    walletAddressUrl: walletAddress ?? "",
    privateKey: process.env.OPEN_PAYMENTS_SECRET_KEY_PATH ?? "",
    keyId: process.env.OPEN_PAYMENTS_KEY_ID ?? "",
  })

  return client
}

export async function getWalletAddressInfo(
  client: AuthenticatedClient,
  walletAddress: string,
): Promise<{ walletAddress: string; walletAddressDetails: WalletAddress }> {
  console.log(">> Getting wallet address info for:", walletAddress)

  if (walletAddress.startsWith("$")) walletAddress = walletAddress.replace("$", "https://")

  try {
    const walletAddressDetails = await client.walletAddress.get({
      url: walletAddress,
    })

    console.log("<< Wallet address details retrieved:", walletAddressDetails.id)
    return { walletAddress, walletAddressDetails }
  } catch (error: any) {
    console.error("Error getting wallet address info:", error)
    throw error
  }
}

export async function createIncomingPayment(
  client: AuthenticatedClient,
  value: string,
  walletAddressDetails: WalletAddress,
  metadata?: any,
): Promise<IncomingPayment> {
  console.log(">> Creating Incoming Payment Resource")
  console.log("Amount:", value)
  console.log("Wallet:", walletAddressDetails.id)

  try {
    // Request IP grant
    const grant = await client.grant.request(
      {
        url: walletAddressDetails.authServer,
      },
      {
        access_token: {
          access: [
            {
              type: "incoming-payment",
              actions: ["read", "create", "complete"],
            },
          ],
        },
      },
    )

    if (isPendingGrant(grant)) {
      throw new Error("Expected non-interactive grant")
    }

    // create incoming payment
    const incomingPayment = await client.incomingPayment.create(
      {
        url: walletAddressDetails.resourceServer,
        accessToken: grant.access_token.value,
      },
      {
        walletAddress: walletAddressDetails.id,
        incomingAmount: {
          value: value,
          assetCode: walletAddressDetails.assetCode,
          assetScale: walletAddressDetails.assetScale,
        },
        expiresAt: new Date(Date.now() + 60_000 * 30).toISOString(), // 30 minutes
        metadata: metadata,
      },
    )

    console.log("<< Incoming Payment created:", incomingPayment.id)
    return incomingPayment
  } catch (error: any) {
    console.error("Error creating incoming payment:", error)
    throw error
  }
}

export async function createQuote(
  client: AuthenticatedClient,
  incomingPaymentUrl: string,
  walletAddressDetails: WalletAddress,
  debitAmount?: { value: string; assetCode: string; assetScale: number },
): Promise<Quote> {
  console.log(">> Creating quote")
  console.log("Incoming Payment URL:", incomingPaymentUrl)
  console.log("Donor Wallet:", walletAddressDetails.id)

  try {
    // Request Quote grant
    const grant = await client.grant.request(
      {
        url: walletAddressDetails.authServer,
      },
      {
        access_token: {
          access: [
            {
              type: "quote",
              actions: ["create", "read", "read-all"],
            },
          ],
        },
      },
    )

    if (isPendingGrant(grant)) {
      throw new Error("Expected non-interactive grant")
    }

    // Create quote payload
    const quotePayload: any = {
      method: "ilp",
      walletAddress: walletAddressDetails.id,
      receiver: incomingPaymentUrl,
    }

    // Add debitAmount if provided
    if (debitAmount) {
      quotePayload.debitAmount = debitAmount
    }

    const quote = await client.quote.create(
      {
        url: walletAddressDetails.resourceServer,
        accessToken: grant.access_token.value,
      },
      quotePayload,
    )

    console.log("<< Quote created:", quote.id)
    return quote
  } catch (error: any) {
    console.error("Error creating quote:", error)
    throw error
  }
}

export async function createOutgoingPaymentPendingGrant(
  client: AuthenticatedClient,
  paymentDetails: {
    quoteId: string
    debitAmount?: { value: string; assetCode: string; assetScale: number }
    receiveAmount?: { value: string; assetCode: string; assetScale: number }
    redirectUrl: string
  },
  walletAddressDetails: WalletAddress,
) {
  console.log(">> Creating outgoing payment pending grant")
  console.log("Quote ID:", paymentDetails.quoteId)
  console.log("Redirect URL:", paymentDetails.redirectUrl)

  try {
    const { quoteId, redirectUrl } = paymentDetails

    // Generate a nonce for security
    const nonce = crypto.randomUUID()

    // Prepare the access item with proper limits structure
    const accessItem: any = {
      type: "outgoing-payment",
      actions: ["create", "read", "read-all"],
      identifier: walletAddressDetails.id,
    }

    // Add limits - Open Payments expects either debitAmount OR receiveAmount, not both
    if (paymentDetails.debitAmount) {
      accessItem.limits = {
        debitAmount: paymentDetails.debitAmount,
      }
    } else if (paymentDetails.receiveAmount) {
      accessItem.limits = {
        receiveAmount: paymentDetails.receiveAmount,
      }
    }

    // Request outgoing payment grant
    const grant = await client.grant.request(
      {
        url: walletAddressDetails.authServer,
      },
      {
        access_token: {
          access: [accessItem],
        },
        interact: {
          start: ["redirect"],
          finish: {
            method: "redirect",
            uri: redirectUrl,
            nonce: nonce,
          },
        },
      },
    )

    if (!isPendingGrant(grant)) {
      throw new Error("Expected interactive grant")
    }

    console.log("<< Outgoing payment pending grant created")
    console.log("Continue URI:", grant.continue.uri)
    console.log("Redirect URL:", grant.interact?.redirect)
    console.log("Nonce:", nonce)

    return {
      continueUri: grant.continue.uri,
      continueAccessToken: grant.continue.access_token.value,
      interactRef: grant.interact?.finish,
      redirectUrl: grant.interact?.redirect,
      nonce: nonce, // ✅ Include nonce for validation
    }
  } catch (error: any) {
    console.error("Error creating outgoing payment pending grant:", error)
    throw error
  }
}

// ✅ FIXED: Completely rewritten payment completion logic
export async function completePaymentAfterAuth(
  client: AuthenticatedClient,
  paymentData: {
    continueUri: string
    continueAccessToken: string
    interactRef: string
    quoteId: string
    senderWalletAddress: string
    metadata?: any
  },
): Promise<OutgoingPayment> {
  console.log(">> Completing payment after user authorization")
  console.log("Continue URI:", paymentData.continueUri)
  console.log("Interact Ref:", paymentData.interactRef)
  console.log("Quote ID:", paymentData.quoteId)

  try {
    // Step 1: Continue the grant with the interaction reference
    console.log("Step 1: Continuing grant with interaction reference...")
    
    const grantContinuation = await client.grant.continue(
      {
        url: paymentData.continueUri,
        accessToken: paymentData.continueAccessToken,
      },
      {
        interact_ref: paymentData.interactRef,
      },
    )

    console.log("Grant continuation response:", JSON.stringify(grantContinuation, null, 2))

    // Step 2: Check if we have a valid access token
    if (!grantContinuation || !("access_token" in grantContinuation)) {
      throw new Error("Grant continuation failed: No access token received")
    }

    const grant = grantContinuation as any
    
    if (!grant.access_token?.value) {
      throw new Error("Grant continuation failed: Access token value is missing")
    }

    console.log("✅ Grant continued successfully, access token received")

    // Step 3: Get sender wallet details
    console.log("Step 2: Getting sender wallet details...")
    const { walletAddressDetails } = await getWalletAddressInfo(client, paymentData.senderWalletAddress)

    // Step 4: Create the outgoing payment
    console.log("Step 3: Creating outgoing payment...")
    const outgoingPayment = await client.outgoingPayment.create(
      {
        url: walletAddressDetails.resourceServer,
        accessToken: grant.access_token.value,
      },
      {
        walletAddress: walletAddressDetails.id,
        quoteId: paymentData.quoteId,
        metadata: paymentData.metadata,
      },
    )

    console.log("✅ Outgoing payment created successfully:", outgoingPayment.id)
    console.log("Payment details:", {
      id: outgoingPayment.id,
      walletAddress: outgoingPayment.walletAddress,
      quoteId: outgoingPayment.quoteId,
      createdAt: outgoingPayment.createdAt,
      // Check if these properties exist before logging
      ...(outgoingPayment.sentAmount && { sentAmount: outgoingPayment.sentAmount }),
      ...(outgoingPayment.receiveAmount && { receiveAmount: outgoingPayment.receiveAmount }),
      ...('updatedAt' in outgoingPayment && { updatedAt: outgoingPayment.updatedAt }),
      ...('grantId' in outgoingPayment && { grantId: outgoingPayment.grantId }),
      ...('failed' in outgoingPayment && { failed: outgoingPayment.failed }),
    })
    
    return outgoingPayment
  } catch (error: any) {
    console.error("❌ Error completing payment after auth:")
    console.error("Error name:", error.name)
    console.error("Error message:", error.message)
    console.error("Error status:", error.status)
    console.error("Error details:", error.description || error.details)
    console.error("Full error:", JSON.stringify(error, null, 2))
    throw error
  }
}

// ✅ Keep the old createOutgoingPayment for backward compatibility
export async function createOutgoingPayment(
  client: AuthenticatedClient,
  paymentDetails: {
    continueAccessToken: string
    quoteId: string
    interactRef?: string
    continueUri: string
    metadata?: any
  },
  walletAddressDetails: WalletAddress,
): Promise<OutgoingPayment> {
  console.log(">> Creating outgoing payment (legacy method)")
  
  // Use the new completion logic
  return completePaymentAfterAuth(client, {
    continueUri: paymentDetails.continueUri,
    continueAccessToken: paymentDetails.continueAccessToken,
    interactRef: paymentDetails.interactRef || "",
    quoteId: paymentDetails.quoteId,
    senderWalletAddress: walletAddressDetails.id,
    metadata: paymentDetails.metadata,
  })
}

// ✅ UPDATED: Q-Pay initiation with better error handling
export async function initiateQPayDonation(
  client: AuthenticatedClient,
  donationDetails: {
    receiverWallet: string
    donorWallet: string
    amount: string
    redirectUrl: string
    metadata?: any
    note?: string
  },
) {
  console.log(">> Initiating Q-Pay donation flow")
  console.log("Donation details:", JSON.stringify(donationDetails, null, 2))

  const { receiverWallet, donorWallet, amount, redirectUrl, metadata, note } = donationDetails

  try {
    // Step 1: Get wallet address info for both receiver and donor
    console.log("Step 1: Getting receiver wallet info...")
    const { walletAddressDetails: receiverWalletDetails } = await getWalletAddressInfo(client, receiverWallet)

    console.log("Step 2: Getting donor wallet info...")
    const { walletAddressDetails: donorWalletDetails } = await getWalletAddressInfo(client, donorWallet)

    // Step 2: Create incoming payment on receiver's wallet
    console.log("Step 3: Creating incoming payment...")
    const incomingPayment = await createIncomingPayment(client, amount, receiverWalletDetails, {
      ...metadata,
      qpay: true,
      note: note,
      timestamp: new Date().toISOString(),
    })

    // Step 3: Create quote on donor's wallet with debitAmount
    console.log("Step 4: Creating quote with debit amount...")
    const debitAmount = {
      value: amount,
      assetCode: donorWalletDetails.assetCode,
      assetScale: donorWalletDetails.assetScale,
    }

    const quote = await createQuote(client, incomingPayment.id, donorWalletDetails, debitAmount)

    // Step 4: Create outgoing payment authorization
    console.log("Step 5: Creating outgoing payment authorization...")
    const authResponse = await createOutgoingPaymentPendingGrant(
      client,
      {
        quoteId: quote.id,
        debitAmount: quote.debitAmount,
        redirectUrl: redirectUrl,
      },
      donorWalletDetails,
    )

    console.log("✅ Q-Pay donation flow initiated successfully")

    return {
      incomingPayment,
      quote,
      authResponse,
      donorWalletAddress: donorWallet,
      receiverWalletAddress: receiverWallet,
      status: "pending_user_interaction",
      message: "User needs to complete authorization at the provided redirect URL",
      flow: "qpay_donation",
    }
  } catch (error: any) {
    console.error("❌ Error in Q-Pay donation flow:", error)
    throw error
  }
}