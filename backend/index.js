const express = require("express");
const multer = require("multer");
const mysql = require("mysql2");
const path = require("path");
const { exec } = require("child_process");
const fs = require("fs");
const cors = require("cors");

const app = express();
const PORT = 3003;
app.use(cors());
const upload = multer({
  dest: path.join(__dirname, "../finger-check/uploads"),
});

const db = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "subi@180205_",
  database: "voting_system",
  port: 3306,
});

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Admin login endpoint
app.post("/api/admin", upload.single("fingerprint"), (req, res) => {
  console.log(req.body);
  const { name, password } = req.body;
  const fingerprintFile = req.file ? req.file.path : null;
  console.log("Fingerprint file path:", fingerprintFile);

  if (!name || !password) {
    return res.status(400).json({ error: "Name and password are required" });
  }

  const query =
    "SELECT username, password, HEX(fingerprint_hash) AS fingerprint_hash FROM admin WHERE username = ? LIMIT 1";

  db.query(query, [name], (err, results) => {
    if (err) {
      console.error("Database query failed:", err);
      return res.status(500).json({ error: "Database query failed" });
    }

    if (results.length === 0) {
      return res.status(400).json({ error: "User not found" });
    }

    const admin = results[0];

    if (password !== admin.password) {
      return res.status(401).json({ error: "Invalid password" });
    }

    if (fingerprintFile) {
      const pythonScriptPath = path.join(__dirname, "../finger-check/check.py");
      const storedFingerprintHash = admin.fingerprint_hash.toLowerCase();

      exec(
        `python ${pythonScriptPath} "${fingerprintFile}" "${storedFingerprintHash}"`,
        (error, stdout, stderr) => {
          if (error) {
            console.error(`Error executing Python script: ${error.message}`);
            return res
              .status(500)
              .json({ error: "Fingerprint comparison failed" });
          }
          if (stderr) {
            console.error(`Python script stderr: ${stderr}`);
            return res
              .status(500)
              .json({ error: "Fingerprint comparison failed" });
          }

          if (stdout.trim() === "MATCH") {
            return res
              .status(200)
              .json({ message: "Login successful", redirect: "/admin-board" });
          } else {
            return res
              .status(401)
              .json({ error: "Fingerprint does not match" });
          }
        }
      );
    } else {
      return res
        .status(200)
        .json({ message: "Login successful", redirect: "/admin-board" });
    }
  });
});

// Insert voter endpoint
app.post("/api/insert", upload.single("fingerprint"), (req, res) => {
  const { name, dob } = req.body;
  const fingerprintFile = req.file ? req.file.path : null;

  if (!name || !dob || !fingerprintFile) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const pythonScriptPath = path.join(
    __dirname,
    "../finger-check/generate_hash.py"
  );

  exec(
    `python ${pythonScriptPath} "${fingerprintFile}"`,
    (error, stdout, stderr) => {
      if (error) {
        console.error(`Error executing Python script: ${error.message}`);
        return res.status(500).json({ error: "Fingerprint processing failed" });
      }
      if (stderr) {
        console.error(`Python script stderr: ${stderr}`);
        return res.status(500).json({ error: "Fingerprint processing failed" });
      }

      const fingerprintHash = stdout.trim();
      const getLastVoterQuery =
        "SELECT voter_unique_id FROM voter ORDER BY voter_unique_id DESC LIMIT 1";

      db.query(getLastVoterQuery, (err, results) => {
        if (err) {
          console.error("Failed to fetch last voter_unique_id:", err);
          return res
            .status(500)
            .json({ error: "Failed to fetch voter_unique_id" });
        }

        let newVoterId;
        if (results.length === 0) {
          newVoterId = "ind001";
        } else {
          const lastVoterId = results[0].voter_unique_id;
          const numericPart = parseInt(lastVoterId.slice(3));
          const newNumericPart = (numericPart + 1).toString().padStart(3, "0");
          newVoterId = `ind${newNumericPart}`;
        }

        const insertQuery =
          "INSERT INTO voter (voter_unique_id, name, dob, fingerprint_hash) VALUES (?, ?, ?, UNHEX(?))";

        db.query(
          insertQuery,
          [newVoterId, name, dob, fingerprintHash],
          (err, result) => {
            if (err) {
              console.error("Failed to insert voter:", err);
              return res.status(500).json({ error: "Failed to insert voter" });
            }

            return res.status(200).json({
              message: "Voter inserted successfully",
              voter_unique_id: newVoterId,
            });
          }
        );
      });
    }
  );
});

// Voting endpoint
app.post("/api/fetch-voter-details", (req, res) => {
  const { voterID } = req.body;
  if (!voterID) {
    return res.status(400).json({ error: "Voter ID is required" });
  }

  // Fetch voter details
  const query =
    "SELECT voter_unique_id, name, dob, HEX(fingerprint_hash) AS fingerprint_hash FROM voter WHERE voter_unique_id = ? LIMIT 1";
  db.query(query, [voterID], (err, results) => {
    if (err) {
      console.error("Database query failed:", err);
      return res.status(500).json({ error: "Database query failed" });
    }

    if (results.length === 0) {
      return res.status(404).json({ error: "Voter not found" });
    }

    const voter = results[0];
    res.status(200).json({
      voterDetails: {
        voter_unique_id: voter.voter_unique_id,
        name: voter.name,
        dob: voter.dob,
        fingerprint_hash: voter.fingerprint_hash,
      },
    });
  });
});
app.post(
  "/api/verify-fingerprint",
  upload.single("fingerprint"),
  (req, res) => {
    const fingerprintFile = req.file ? req.file.path : null;
    const fingerprintHash = req.body.fingerprint_hash;
    if (!fingerprintFile || !fingerprintHash) {
      return res
        .status(400)
        .json({ error: "Fingerprint file or hash is missing" });
    }
    const pythonScriptPath = path.join(__dirname, "../finger-check/check.py");

    exec(
      `python ${pythonScriptPath} "${fingerprintFile}" "${fingerprintHash.toLowerCase()}"`,
      (error, stdout, stderr) => {
        if (error) {
          console.error(`Error executing Python script: ${error.message}`);
          return res
            .status(500)
            .json({ error: "Fingerprint comparison failed" });
        }
        if (stderr) {
          console.error(`Python script stderr: ${stderr}`);
          return res
            .status(500)
            .json({ error: "Fingerprint comparison failed" });
        }

        if (stdout.trim() === "MATCH") {
          res.status(200).json({ message: "Fingerprint matches" });
        } else {
          res.status(401).json({ message: "Fingerprint does not match" });
        }
      }
    );
  }
);

app.post("/api/vote", (req, res) => {
  const { candidateID } = req.body;
  console.log("Received vote request for candidate ID:", candidateID);

  if (!candidateID) {
    return res.status(400).json({ error: "Candidate ID is required" });
  }
  const updateVoteQuery =
    "UPDATE candidates SET vote_count = vote_count + 1 WHERE candidate_id = ?";
  db.query(updateVoteQuery, [candidateID], (err, result) => {
    if (err) {
      console.error("Failed to update vote count:", err);
      return res.status(500).json({ error: "Failed to update vote count" });
    }

    return res.status(200).json({ message: "Vote recorded successfully" });
  });
});
app.get("/api/get-votes", (req, res) => {
  const query = "SELECT name, party, vote_count FROM candidates";
  db.query(query, (err, results) => {
    if (err) {
      console.error("Database query failed:", err);
      return res.status(500).json({ error: "Database query failed" });
    }

    res.status(200).json({ candidates: results });
  });
});
app.delete("/api/delete-voter/:voter_unique_id", (req, res) => {
  const voter_unique_id = req.params.voter_unique_id;

  const query = "DELETE FROM voter WHERE voter_unique_id = ?";

  db.query(query, [voter_unique_id], (err, result) => {
    if (err) {
      console.error("Error deleting voter:", err);
      return res.status(500).json({ error: "Failed to delete voter." });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Voter not found." });
    }

    res.json({ message: "Voter successfully deleted." });
  });
});
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
