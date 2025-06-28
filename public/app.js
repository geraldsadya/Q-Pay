const CONFIG = {
    API_BASE_URL: "http://localhost:3001",
    DONOR_WALLET: "$ilp.interledger-test.dev/zars",
    RECEIVER_WALLET: "$ilp.interledger-test.dev/abo1",
    REDIRECT_URL: window.location.origin + "/success.html",
  }
  
  function getPersonId() {
    const path = window.location.pathname
    const match = path.match(/\/donate\/(.+)/)
    return match ? match[1] : "nomsa123"
  }
  
  document.addEventListener("DOMContentLoaded", () => {
    const personId = getPersonId()
    updatePersonInfo(personId)
    setupEventListeners()
  })
  
  function updatePersonInfo(personId) {
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
    const amountButtons = document.querySelectorAll(".amount-btn")
    const customAmountInput = document.getElementById("customAmount")
  
    amountButtons.forEach((btn) => {
      btn.addEventListener("click", function () {
        amountButtons.forEach((b) => b.classList.remove("selected"))
        this.classList.add("selected")
  
        if (this.dataset.amount === "custom") {
          customAmountInput.style.display = "block"
          customAmountInput.focus()
        } else {
          customAmountInput.style.display = "none"
          customAmountInput.value = ""
        }
      })
    })
  
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
  
        sessionStorage.setItem('qpay_payment_data', JSON.stringify(paymentData));
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
  
    const response = await fetch(`${CONFIG.API_BASE_URL}/api/qpay-donation`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(donationData),
    })
  
    const responseData = await response.json()
  
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
  
    setTimeout(() => {
      errorEl.style.display = "none"
    }, 10000)
  }
  
  const urlParams = new URLSearchParams(window.location.search)
  if (urlParams.get("test") === "true") {
    setTimeout(() => {
      document.querySelector('[data-amount="10"]').click()
      document.getElementById("purpose").value = "food"
      document.getElementById("donorName").value = "Test Donor"
    }, 100)
  } 