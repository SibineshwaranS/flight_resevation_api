const express = require("express");
const router = express.Router();
const pool = require("db");
const multer = require("multer");

// --- MULTER CONFIGURATION (CHANGED) ---
// We now use memoryStorage to keep the file as a buffer in memory.
const storage = multer.memoryStorage(); 
const upload = multer({ storage: storage });

// --- ROUTES ---

// ➕ Create Customer Profile (LOGIC CHANGED FOR TRANSACTION AND STATUS UPDATE)
router.post("/create", upload.single("photo"), async (req, res) => {
  // A transaction ensures both database operations succeed or both fail.
  const client = await pool.connect();

  try {
    const {
      user_id, full_name, date_of_birth, gender, nationality, passport_no,
      frequent_flyer_no, address, city, country, phone
    } = req.body;

    const photo_data = req.file ? req.file.buffer : null;

    // ... (Your role check logic can remain the same) ...
    const roleCheck = await client.query("SELECT role FROM users WHERE id=$1", [user_id]);
    if (roleCheck.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }
    if (["staff", "admin"].includes(roleCheck.rows[0].role.toLowerCase())) {
        return res.status(400).json({ error: "Staff and Admin cannot have customer profiles" });
    }

    // Start the transaction
    await client.query('BEGIN');

    // ⭐️ STEP 1 (Original Logic): Insert the new customer profile
    const profileResult = await client.query(
      `INSERT INTO customer_profiles 
      (user_id, full_name, date_of_birth, gender, nationality, passport_no, frequent_flyer_no, address, city, country, phone, photo_data, created_at, updated_at) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW()) 
      RETURNING *`,
      [
        user_id, full_name, date_of_birth, gender, nationality, passport_no,
        frequent_flyer_no, address, city, country, phone,
        photo_data
      ]
    );

    // ⭐️ STEP 2 (New Logic): Update the 'users' table to mark the profile as complete
    await client.query(
      'UPDATE users SET profile_completed = TRUE WHERE id = $1',
      [user_id]
    );
    
    // Commit the transaction if both queries were successful
    await client.query('COMMIT');

    const profile = profileResult.rows[0];
    delete profile.photo_data; 
    res.status(201).json(profile);

  } catch (err) {
    // If any error occurs, roll back the transaction
    await client.query('ROLLBACK');
    console.error("Create Profile Error:", err);
    res.status(500).json({ error: err.message });
  } finally {
    // Release the client back to the pool
    client.release();
  }
});


// ✏️ Update Profile (LOGIC CHANGED)
router.put("/update/:user_id", upload.single("photo"), async (req, res) => {
    try {
        const {
            full_name, date_of_birth, gender, nationality, passport_no, frequent_flyer_no,
            address, city, country, phone
        } = req.body;

        const user_id = req.params.user_id;
        
        // Build the update query dynamically
        let query = 'UPDATE customer_profiles SET full_name=$1, date_of_birth=$2, gender=$3, nationality=$4, passport_no=$5, frequent_flyer_no=$6, address=$7, city=$8, country=$9, phone=$10, updated_at=NOW()';
        const values = [full_name, date_of_birth, gender, nationality, passport_no, frequent_flyer_no, address, city, country, phone];
        
        // If a new photo is uploaded, add it to the query
        if (req.file) {
            values.push(req.file.buffer);
            query += `, photo_data=$${values.length}`;
        }
        
        values.push(user_id);
        query += ` WHERE user_id=$${values.length} RETURNING *`;

        const result = await pool.query(query, values);
        
        if (result.rows.length === 0) return res.status(404).json({ error: "Profile not found" });
        
        const profile = result.rows[0];
        delete profile.photo_data;
        res.json(profile);

    } catch (err) {
        console.error("Update Profile Error:", err);
        res.status(500).json({ error: err.message });
    }
});


// 📥 Get Profile by User ID (No change needed, but we will add a new route for the photo)
router.get("/read/:user_id", async (req, res) => {
    try {
        // Query all fields EXCEPT the large binary data
        const result = await pool.query("SELECT user_id, full_name, date_of_birth, gender, nationality, passport_no, frequent_flyer_no, address, city, country, phone, created_at, updated_at FROM customer_profiles WHERE user_id=$1", [req.params.user_id]);
        if (result.rows.length === 0) return res.status(404).json({ error: "Profile not found" });
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// ✨✨ NEW ROUTE TO SERVE THE PHOTO ✨✨
// This endpoint is what the <img> tag on your frontend will use.
router.get("/photo/:user_id", async (req, res) => {
    try {
        const result = await pool.query("SELECT photo_data FROM customer_profiles WHERE user_id=$1", [req.params.user_id]);
        
        if (result.rows.length === 0 || !result.rows[0].photo_data) {
            return res.status(404).send("Not found");
        }

        // Send the binary data back to the browser
        // We assume the images are JPEGs. For a real app, you'd also store the content type.
        res.set("Content-Type", "image/jpeg"); 
        res.send(result.rows[0].photo_data);

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


module.exports = router;
