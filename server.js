// server.js (Track PMS → Clean Listings API with Cover Image)
// ------------------------------------------------------------

const express = require("express");
const axios = require("axios");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

// 🟢 HEALTH CHECK
app.get("/", (req, res) => {
  res.send("Track PMS API is running 🚀");
});

// 🟢 MAIN ENDPOINT
app.post("/track/listings", async (req, res) => {
  try {
    const { domain, apiKey, apiSecret } = req.body;

    if (!domain || !apiKey || !apiSecret) {
      return res.status(400).json({
        error: "Missing required fields: domain, apiKey, apiSecret",
      });
    }

    const baseUrl = `https://${domain}.trackhs.com/api/pms/units`;
    const auth = {
      headers: {
        Authorization: "Basic " + Buffer.from(`${apiKey}:${apiSecret}`).toString("base64"),
        Accept: "application/json"
      },
      timeout: 20000
    };

    // -----------------------------------------------------
    // 🟦 PAGINATION — FETCH ALL ACTIVE UNITS
    // -----------------------------------------------------
    let page = 1;
    const size = 100;
    let allUnits = [];

    while (true) {
      const url = `${baseUrl}?page=${page}&size=${size}`;
      console.log("Fetching page:", url);

      const response = await axios.get(url, auth);
      const embedded = response.data._embedded;

      if (!embedded || !embedded.units || embedded.units.length === 0) break;

      allUnits = allUnits.concat(embedded.units);
      page++;

      // 409 = page out of range
      if (page > 200) break;
    }

    // Filter ACTIVE units
    const activeUnits = allUnits.filter(u => u.isActive === true);

    // -----------------------------------------------------
    // 🟦 Fetch Cover Image for Each Unit (page=1 size=1)
    // -----------------------------------------------------
    async function getCoverImage(unitId) {
      try {
        const imgUrl = `https://${domain}.trackhs.com/api/pms/units/${unitId}/images?page=1&size=1`;
        const imgResponse = await axios.get(imgUrl, auth);

        const imgs = imgResponse.data._embedded?.images;
        if (imgs && imgs.length > 0) {
          return imgs[0].url; // Primary image
        }
      } catch (err) {
        console.log("Image fetch failed for:", unitId);
      }
      return null;
    }

    // -----------------------------------------------------
    // 🟦 Build Clean Listings JSON for Glide
    // -----------------------------------------------------
    const listings = [];

    for (const unit of activeUnits) {
      const coverImage = await getCoverImage(unit.id);

      listings.push({
        id: unit.id,
        name: unit.name || null,
        street: unit.street || null,
        address: unit.address || null,
        city: unit.city || null,
        state: unit.state || null,
        zipcode: unit.zip || null,
        bedrooms: unit.bedrooms || null,
        bathrooms: unit.bathrooms || null,
        wifiUsername: unit.custom?.pms_units_network || null,
        wifiPassword: unit.custom?.pms_units_network_password || null,
        cleannessStatus: unit.cleanStatusId || null,
        picture: coverImage
      });
    }

    return res.json({
      count: listings.length,
      listings
    });

  } catch (err) {
    console.error("Server error:", err.response?.data || err.message);
    return res.status(500).json({
      error: "Failed fetching Track units",
      detail: err.response?.data || err.message
    });
  }
});

// -----------------------------------------------------
// 🟢 START SERVER
// -----------------------------------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Track PMS API running on port ${PORT}`);
});
