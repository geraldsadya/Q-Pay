// Configuration
const CONFIG = {
    API_BASE_URL: "http://localhost:3001", // Your backend server
    DONOR_WALLET: "$ilp.interledger-test.dev/shmoney", // YOUR ZAR wallet (sending money)
    RECEIVER_WALLET: "$ilp.interledger-test.dev/shelter", // Replace with receiver wallet
    REDIRECT_URL: window.location.origin + "/success.html", // Where to redirect after payment
  }
  
  function getPersonId() {
    const path = window.location.pathname
    const match = path.match(/\/donate\/(.+)/)
    return match ? match[1] : "nomsa123"
  }
  
  // Initialize the page
  document.addEventListener("DOMContentLoaded", () => {
    const personId = getPersonId()
  
    // You could fetch person details from your backend here
    // For now, we'll use default values
    updatePersonInfo(personId)
  
    setupEventListeners()
  })
  
  function updatePersonInfo(personId) {
    // In a real app, you'd fetch this from your backend
    const personData = {
      nomsa123: {
        name: "Nomsa",
        story:
          "Help Nomsa get back on her feet. Every donation makes a difference in providing essential needs like food, shelter, and support.",
        photo: "👤",
      },
    }
  
    const person = personData[personId] || personData["nomsa123"]
  
    document.getElementById("personName").textContent = person.name
    document.getElementById("personStory").textContent = person.story
    document.querySelector(".profile-photo").textContent = person.photo
  }
  
  function setupEventListeners() {
    // Amount button selection
    const amountButtons = document.querySelectorAll(".amount-btn")
    const customAmountInput = document.getElementById("customAmount")
  
    amountButtons.forEach((btn) => {
      btn.addEventListener("click", function () {
        // Remove selected class from all buttons
        amountButtons.forEach((b) => b.classList.remove("selected"))
  
        // Add selected class to clicked button
        this.classList.add("selected")
  
        // Show/hide custom amount input
        if (this.dataset.amount === "custom") {
          customAmountInput.style.display = "block"
          customAmountInput.focus()
        } else {
          customAmountInput.style.display = "none"
          customAmountInput.value = ""
        }
      })
    })
  
    // Form submission
    document.getElementById("donationForm").addEventListener("submit", handleDonation)
  }
  
  async function handleDonation(event) {
    event.preventDefault()
  
    const formData = getFormData()
  
    if (!validateForm(formData)) {
      return
    }
  
    setLoading(true)
  
    try {
      const result = await initiateDonation(formData)
  
      if (result.success && result.data && result.data.authResponse && result.data.authResponse.redirectUrl) {
        // ✅ NEW: Store payment data in sessionStorage for completion after redirect
        const paymentData = {
          continueUri: result.data.authResponse.continueUri,
          continueAccessToken: result.data.authResponse.continueAccessToken,
          quoteId: result.data.quote.id,
          metadata: {
            donorName: formData.donorName,
            homelessPersonId: formData.personId,
            shelterName: "Q-Pay Demo",
            purpose: formData.purpose,
          }
        };
  
        console.log('Storing payment data in sessionStorage:', paymentData);
        sessionStorage.setItem('qpay_payment_data', JSON.stringify(paymentData));
  
        // Redirect to payment authorization
        console.log("Redirecting to:", result.data.authResponse.redirectUrl)
        window.location.href = result.data.authResponse.redirectUrl
      } else {
        throw new Error("Failed to get authorization URL from server")
      }
    } catch (error) {
      console.error("Donation error:", error)
      showError(`Failed to process donation: ${error.message}`)
      setLoading(false)
    }
  }
  
  function getFormData() {
    const selectedAmountBtn = document.querySelector(".amount-btn.selected")
    let amount = ""
  
    if (selectedAmountBtn) {
      if (selectedAmountBtn.dataset.amount === "custom") {
        amount = document.getElementById("customAmount").value
      } else {
        amount = selectedAmountBtn.dataset.amount
      }
    }
  
    return {
      amount: amount,
      purpose: document.getElementById("purpose").value,
      donorName: document.getElementById("donorName").value || "Anonymous",
      personId: getPersonId(),
    }
  }
  
  function validateForm(formData) {
    if (!formData.amount || Number.parseFloat(formData.amount) <= 0) {
      showError("Please select or enter a valid amount")
      return false
    }
  
    if (!formData.purpose) {
      showError("Please select a purpose for your donation")
      return false
    }
  
    return true
  }
  
  async function initiateDonation(formData) {
    const donationData = {
      receiverWallet: CONFIG.RECEIVER_WALLET,
      donorWallet: CONFIG.DONOR_WALLET,
      amount: formData.amount.toString(),
      redirectUrl: CONFIG.REDIRECT_URL,
      metadata: {
        donorName: formData.donorName,
        homelessPersonId: formData.personId,
        shelterName: "Q-Pay Demo",
        purpose: formData.purpose,
      },
      note: `${formData.purpose} donation for ${formData.personId}`,
    }
  
    console.log("Sending donation data:", donationData)
  
    const response = await fetch(`${CONFIG.API_BASE_URL}/api/qpay-donation`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(donationData),
    })
  
    const responseData = await response.json()
    console.log("Server response:", responseData)
  
    if (!response.ok) {
      throw new Error(responseData.message || responseData.error || "Network error")
    }
  
    return responseData
  }
  
  function setLoading(isLoading) {
    const loadingEl = document.getElementById("loading")
    const donateBtn = document.getElementById("donateBtn")
  
    if (isLoading) {
      loadingEl.style.display = "block"
      donateBtn.disabled = true
      donateBtn.textContent = "Processing..."
    } else {
      loadingEl.style.display = "none"
      donateBtn.disabled = false
      donateBtn.textContent = "Donate Now"
    }
  }
  
  function showError(message) {
    const errorEl = document.getElementById("error")
    errorEl.textContent = message
    errorEl.style.display = "block"
  
    // Hide error after 10 seconds
    setTimeout(() => {
      errorEl.style.display = "none"
    }, 10000)
  }
  
  // Handle URL parameters (for testing)
  const urlParams = new URLSearchParams(window.location.search)
  if (urlParams.get("test") === "true") {
    // Pre-fill form for testing
    setTimeout(() => {
      document.querySelector('[data-amount="10"]').click()
      document.getElementById("purpose").value = "food"
      document.getElementById("donorName").value = "Test Donor"
    }, 100)
  }
