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
  if (walletAddress.startsWith("$")) walletAddress = walletAddress.replace("$", "https://")

  try {
    const walletAddressDetails = await client.walletAddress.get({
      url: walletAddress,
    })

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
  try {
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
        expiresAt: new Date(Date.now() + 60_000 * 30).toISOString(),
        metadata: metadata,
      },
    )

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
  try {
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

    const quotePayload: any = {
      method: "ilp",
      walletAddress: walletAddressDetails.id,
      receiver: incomingPaymentUrl,
    }

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
  try {
    const { quoteId, redirectUrl } = paymentDetails
    const nonce = crypto.randomUUID()

    const accessItem: any = {
      type: "outgoing-payment",
      actions: ["create", "read", "read-all"],
      identifier: walletAddressDetails.id,
    }

    if (paymentDetails.debitAmount) {
      accessItem.limits = {
        debitAmount: paymentDetails.debitAmount,
      }
    }

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
      throw new Error("Expected pending grant")
    }

    return {
      continueUri: grant.continue.uri,
      continueAccessToken: grant.continue.access_token.value,
      redirectUrl: grant.interact.redirect,
      nonce: nonce,
    }
  } catch (error: any) {
    console.error("Error creating outgoing payment pending grant:", error)
    throw error
  }
}

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
  try {
    const { continueUri, continueAccessToken, interactRef, quoteId, senderWalletAddress, metadata } = paymentData

    const grantContinuationResponse = await client.grant.continue(
      {
        url: continueUri,
        accessToken: continueAccessToken,
      },
      {
        interact_ref: interactRef,
      },
    )

    const { walletAddressDetails } = await getWalletAddressInfo(client, senderWalletAddress)

    const outgoingPayment = await client.outgoingPayment.create(
      {
        url: walletAddressDetails.resourceServer,
        accessToken: (grantContinuationResponse as any).access_token.value,
      },
      {
        walletAddress: walletAddressDetails.id,
        quoteId: quoteId,
        metadata: metadata,
      },
    )

    return outgoingPayment
  } catch (error: any) {
    console.error("Error completing payment after auth:", error)
    throw error
  }
}

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
  try {
    const outgoingPayment = await client.outgoingPayment.create(
      {
        url: walletAddressDetails.resourceServer,
        accessToken: paymentDetails.continueAccessToken,
      },
      {
        walletAddress: walletAddressDetails.id,
        quoteId: paymentDetails.quoteId,
        metadata: paymentDetails.metadata,
      },
    )

    return outgoingPayment
  } catch (error: any) {
    console.error("Error creating outgoing payment:", error)
    throw error
  }
}

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
  try {
    const { receiverWallet, donorWallet, amount, redirectUrl, metadata, note } = donationDetails

    const { walletAddressDetails: receiverWalletDetails } = await getWalletAddressInfo(client, receiverWallet)
    const { walletAddressDetails: donorWalletDetails } = await getWalletAddressInfo(client, donorWallet)

    const incomingPayment = await createIncomingPayment(client, amount, receiverWalletDetails, metadata)

    const quote = await createQuote(client, incomingPayment.id, donorWalletDetails, {
      value: amount,
      assetCode: donorWalletDetails.assetCode,
      assetScale: donorWalletDetails.assetScale,
    })

    const authResponse = await createOutgoingPaymentPendingGrant(
      client,
      {
        quoteId: quote.id,
        debitAmount: {
          value: amount,
          assetCode: donorWalletDetails.assetCode,
          assetScale: donorWalletDetails.assetScale,
        },
        receiveAmount: {
          value: amount,
          assetCode: receiverWalletDetails.assetCode,
          assetScale: receiverWalletDetails.assetScale,
        },
        redirectUrl: redirectUrl,
      },
      donorWalletDetails,
    )

    return {
      authResponse,
      quote,
      incomingPayment,
    }
  } catch (error: any) {
    console.error("Error initiating Q-Pay donation:", error)
    throw error
  }
} 