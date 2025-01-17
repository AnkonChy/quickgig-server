require("dotenv").config();
const express = require("express");
const app = express();
const cors = require("cors");
const jwt = require("jsonwebtoken");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const port = process.env.PORT || 4000;

//middleware
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ri84s.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    console.log("db running");

    const userCollection = client.db("quickGig").collection("users");
    const taskCollection = client.db("quickGig").collection("tasks");
    const submitCollection = client.db("quickGig").collection("submit");
    //jwt related api

    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "1h",
      });
      res.send({ token });
    });
    //users related api

    //add user
    app.post("/users", async (req, res) => {
      const user = req.body;
      //insert email if user doesn't exists:
      //you can do this many ways(1. email uniques, 2.upsert, 3. simple checking)
      const query = { email: user.email };
      const existingUser = await userCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: "user already exists", insertedId: null });
      }
      const result = await userCollection.insertOne(user);
      res.send(result);
    });

    //sort for best workers
    app.get("/sortWorkers", async (req, res) => {
      const filter = { role: "worker" };
      const sort = { coin: -1 };
      const result = await userCollection.find(filter).sort(sort).toArray();
      res.send(result);
    });

    //task related api

    //add task
    app.post("/addTask", async (req, res) => {
      const {
        title,
        detail,
        req_workers,
        amount,
        completion_date,
        sub_info,
        task_img_url,
        owner_email,
        buyer_name,
      } = req.body;

      const user = await userCollection.findOne({ email: owner_email });
      console.log(user);

      const result = await taskCollection.insertOne(data);
      res.send(result);
    });

    //my tasks by email
    app.get("/tasks/owner", async (req, res) => {
      const email = req.query.email;
      console.log(email);
      const filter = { task_owner: email };
      // const sort = { date: -1 };

      const result = await taskCollection.find(filter).toArray();
      // console.log(result);
      res.send(result);
    });

    app.get("/task/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await taskCollection.findOne(query);
      res.send(result);
    });

    //update task
    app.patch("/task/:id", async (req, res) => {
      const task = req.body;
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          title: task.title,
          detail: task.detail,
          req_workers: task.req_workers,
          amount: task.amount,
          completion_date: task.completion_date,
          sub_info: task.sub_info,
          task_img_url: task.task_img_url,
        },
      };
      const result = await taskCollection.updateOne(filter, updatedDoc);
      res.send(result);
    });

    //delete task
    app.delete("/task/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await taskCollection.deleteOne(query);
      res.send(result);
    });

    //all task where required_worker > 0
    app.get("/allTasks", async (req, res) => {
      const query = { req_workers: { $gt: 0 } };
      const result = await taskCollection.find(query).toArray();
      res.send(result);
    });

    //add submit form into submitCollection
    app.post("/addSubmit", async (req, res) => {
      const data = req.body;
      const result = await submitCollection.insertOne(data);
      res.send(result);
    });
  } finally {
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("server is running");
});

app.listen(port, () => {
  console.log(`QuickGig is running on port ${port}`);
});
