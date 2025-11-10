const express = require("express");
const cors = require("cors");
const app = express();
const port = process.env.PORT || 3000;

// middleware
app.use(cors());
app.use(express.json());

const admin = require("firebase-admin");

const serviceAccount = require("./social-events.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

app.get("/", (req, res) => {
  res.send("Server is running fine!");
});

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const uri =
  "mongodb+srv://social_eventsDB:5x5xa74E7OQa2yT9@cluster0.6shlkl1.mongodb.net/?appName=Cluster0";

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const verifyToken = async (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    res.status(401).send({
      message: "unauthorized access. Token not found",
    });
  }
  const token = authorization.split(" ")[1];
  if (!token) {
    return res.status(401).send({ message: "unauthorized access" });
  }
  try {
    const decode = await admin.auth().verifyIdToken(token);
    next();
  } catch (error) {
    res.status(401).send({
      message: "unauthorized access.",
    });
  }
};

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const db = client.db("social_db");
    const eventsCollection = db.collection("events");
    const joinedCollection = db.collection("joined");

    app.post("/events", async (req, res) => {
      const newEvent = req.body;
      // if (!newEvent.title || !newEvent.createdBy) {
      //   return res.status(400).send({ message: "Missing required fields" });
      // }

      const result = await eventsCollection.insertOne(newEvent);
      res.send(result);
    });

    app.get("/events", async (req, res) => {
      const cursor = eventsCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get("/events/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await eventsCollection.findOne(query);
      // if (!result) return res.status(404).send({ message: "Event not found" });
      res.send(result);
    });

    app.put("/events/:id", async (req, res) => {
      const { id } = req.params;
      const data = req.body;
      const existing = await eventsCollection.findOne({
        _id: new ObjectId(id),
      });
      // if (!existing)
      //   return res.status(404).send({ message: "Event not found" });

      if (existing.createdBy !== data.createdBy) {
        return res
          .status(403)
          .send({ message: "Unauthorized: Cannot update others’ events" });
      }
      // console.log(data);
      // console.log(id);
      delete data.createdBy;

      const objectId = new ObjectId(id);
      const result = await eventsCollection.updateOne(
        { _id: objectId },
        { $set: data }
      );

      res.send({
        success: true,
        result,
      });
    });

    app.delete("/events/:id", async (req, res) => {
      const { id } = req.params;

      const existing = await eventsCollection.findOne({
        _id: new ObjectId(id),
      });
      if (!existing) {
        return res.status(404).send({ message: "Event not found" });
      }

      // 2. Ownership check — only the creator can delete
      if (existing.createdBy !== req.user.email) {
        return res
          .status(403)
          .send({ message: "Unauthorized: Cannot delete others’ events" });
      }

      const result = await eventsCollection.deleteOne({
        _id: new ObjectId(id),
      });

      res.send({
        success: true,
        result,
      });
    });

    app.get("/manage-event", verifyToken, async (req, res) => {
      const email = req.query.email;
      const result = await eventsCollection
        .find({ createdBy: email })
        .sort({ date: -1 })
        .toArray();
      res.send(result);
    });

    app.delete("/manage-event/:id", async (req, res) => {
      const { id } = req.params;
      const email = req.query.email;
      // 1. Find the event by ID
      const existing = await eventsCollection.findOne({
        _id: new ObjectId(id),
      });
      if (!existing) {
        return res.status(404).send({ message: "Event not found" });
      }
      // 2. Check ownership
      if (existing.createdBy !== email) {
        return res
          .status(403)
          .send({ message: "Unauthorized: Cannot delete others’ events" });
      }
      // 3. Delete the event
      const result = await eventsCollection.deleteOne({
        _id: new ObjectId(id),
      });
      res.send({
        success: true,
        message: "Event deleted successfully",
        result,
      });
    });

    app.post("/joined", async (req, res) => {
      const data = req.body;

      const result = await joinedCollection.insertOne(data);
      res.send(result);
    });

    app.get("/joined-event", async (req, res) => {
      const email = req.query.email;
      const result = await joinedCollection
        .find({ createdBy: email })
        .sort({ date: -1 })
        .toArray();
      res.send(result);
    });

    app.delete("/joined-event/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const query = ObjectId.isValid(id)
          ? { _id: { $in: [id, new ObjectId(id)] } } // match both string or ObjectId
          : { _id: id };

        const result = await joinedCollection.deleteOne(query);

        if (result.deletedCount === 1) {
          res.status(200).send({ success: true, message: "Event deleted" });
        } else {
          res.status(404).send({ success: false, message: "Event not found" });
        }
      } catch (error) {
        console.error("Error deleting event:", error);
        res.status(500).send({ success: false, message: "Server error" });
      }
    });

    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`Server is listening on port ${port}`);
});
