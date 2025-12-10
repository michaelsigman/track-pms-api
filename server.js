import express from "express";
import cors from "cors";
import axios from "axios";

const app = express();
app.use(express.json());
app.use(cors());

/**
 * Fetch 1 image for a given unit (order = 0)
 */
async function fetchUnitImage(domain, authHeader, unitId) {
  const url = `https://${domain}.trackhs.com/api/pms/units/${unitId}/images?page=1&size=1`;

  try {
    const response = await axios.get(url, {
      headers: { Authorization: authHeader, Accept: "application/json" },
    });

    const images = response.data?._embedded?.images || [];
    if (images.length === 0) return null;

    return images[0].url; // returns the S3 image URL
  } catch (error) {
    console.log(`Image fetch failed for unit ${unitId}:`, error.response?.data || error.message);
    return null;
  }
}

/**
 * Main Track → PoolPilot compressed listing response
 */
app.post("/track/listings", async (req, res) => {
  const { domain, apiKey, apiSecret } = req.body;

  if (!domain || !apiKey || !apiSecret) {
    return res.status(400).json({
      error: "Missing domain, apiKey, or apiSecret",
    });
  }

  const authHeader = "Basic " + Buffer.from(`${apiKey}:${apiSecret}`).toString("base64");

  const pageSize = 100;
  let page = 1;
  let units = [];

  console.log("Starting Track unit fetch…");

  // Fetch ALL pages
  while (true) {
    const url = `https://${domain}.trackhs.com/api/pms/units?page=${page}&size=${pageSize}`;
    console.log(`Fetching page ${page}: ${url}`);

    try {
      const response = await axios.get(url, {
        headers: { Authorization: authHeader, Accept: "application/json" },
      });

      const pageUnits = response.data?._embedded?.units || [];
      if (pageUnits.length === 0) break;

      units = units.concat(pageUnits);
      page++;
    } catch (error) {
      console.log("Track fetch error:", error.response?.data || error.message);
      break;
    }
  }

  console.log(`Total units fetched: ${units.length}`);

  // Filter: only active units
  units = units.filter((u) => u.isActive === true);

  console.log(`Active units: ${units.length}`);

  // Build compressed response
  const listings = [];

  for (const unit of units) {
    const {
      id,
      name,
      streetAddress,
      locality,
      region,
      postal,
      bedrooms,
      fullBathrooms,
      custom,
    } = unit;

    // Extract helpful custom fields
    const wifiUsername = custom?.pms_units_network || custom?.pms_units_wifi_details || null;
    const wifiPassword = custom?.pms_units_network_password || null;

    // FETCH COVER IMAGE (option A)
    const picture = await fetchUnitImage(domain, authHeader, id);

    listings.push({
      id,
      name,
      street: streetAddress,
      address: `${streetAddress}, ${locality}, ${region} ${postal}`,
      city: locality,
      state: region,
      zipcode: postal,
      bedrooms,
      bathrooms: fullBathrooms,
      wifiUsername,
      wifiPassword,
      cleannessStatus: String(unit.cleanStatusId || ""),
      picture, // new!
    });
  }

  return res.json({ total: listings.length, listings });
});

app.get("/", (req, res) => {
  res.send("Track PMS Listing API is running.");
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Track PMS API running on port ${port}`));
