// server.js
const express = require("express");
const axios = require("axios");
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(cors());

// -----------------------------
// TRACK LISTINGS ENDPOINT
// -----------------------------
app.post("/track/listings", async (req, res) => {
  const { domain, apiKey, apiSecret } = req.body;

  if (!domain || !apiKey || !apiSecret) {
    return res.status(400).json({ error: "domain, apiKey, apiSecret are required" });
  }

  const authHeader = "Basic " + Buffer.from(`${apiKey}:${apiSecret}`).toString("base64");
  const BASE_URL = `https://${domain}.trackhs.com/api/pms/units`;
  const SIZE = 100;

  // Fetch one page of results
  async function fetchPage(page) {
    try {
      const url = `${BASE_URL}?page=${page}&size=${SIZE}`;
      console.log("Fetching:", url);

      const response = await axios.get(url, {
        headers: { Authorization: authHeader }
      });

      return response.data;
    } catch (err) {
      if (err.response?.status === 409) {
        // Track says "invalid page" → means you're done
        return { _embedded: { units: [] } };
      }
      throw err;
    }
  }

  // Fetch property's primary image
  async function fetchPrimaryImage(unitId) {
    try {
      const url = `https://${domain}.trackhs.com/api/pms/units/${unitId}/assets`;

      const response = await axios.get(url, {
        headers: { Authorization: authHeader }
      });

      const assets = response.data._embedded?.assets || [];

      const images = assets.filter(
        a => a.type?.toLowerCase() === "image" || a.mimeType?.startsWith("image/")
      );

      if (images.length === 0) return null;

      const primary = images.find(img => img.isPrimary) || images[0];
      return primary.url || null;

    } catch (err) {
      console.log(`Image fetch failed for unit ${unitId}:`, err.message);
      return null;
    }
  }

  try {
    let page = 1;
    let allUnits = [];

    // Pagination loop
    while (true) {
      const data = await fetchPage(page);
      const units = data._embedded?.units || [];

      if (units.length === 0) break;

      allUnits.push(...units);
      page++;
    }

    // Only active properties
    const activeUnits = allUnits.filter(u => u.isActive);

    // Build final minimized JSON with images
    const results = await Promise.all(
      activeUnits.map(async (u) => {
        const imageUrl = await fetchPrimaryImage(u.id);

        return {
          id: u.id,
          name: u.name,
          shortName: u.shortName,
          streetAddress: u.streetAddress,
          city: u.locality,
          region: u.region,
          postal: u.postal,
          unitCode: u.unitCode,
          bedrooms: u.bedrooms,
          bathrooms: u.fullBathrooms,
          latitude: u.latitude,
          longitude: u.longitude,
          imageUrl: imageUrl || null
        };
      })
    );

    res.json({ count: results.length, listings: results });

  } catch (err) {
    console.error("Track error:", err);
    res.status(500).json({ error: err.message });
  }
});

// -----------------------------
// START SERVER
// -----------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Track PMS API running on port ${PORT}`);
});
