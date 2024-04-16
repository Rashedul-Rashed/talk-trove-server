const express = require('express');
const app = express();
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const port = process.env.PORT || 5000;
const stripe = require('stripe')(process.env.PAYMENT_SECRET_KEY);

// middleware
app.use(cors());
app.use(express.json());

const verifyJWT = (req, res, next) => {
	const authorization = req.headers.authorization;
	if (!authorization) {
		return res
			.status(401)
			.send({ error: true, message: 'unauthorized access' });
	}
	const token = authorization.split(' ')[1];

	jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
		if (err) {
			return res
				.status(401)
				.send({ error: true, message: 'unauthorized access' });
		}
		req.decoded = decoded;
		next();
	});
};

// mongo db

const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.obhsxav.mongodb.net/?retryWrites=true&w=majority`;

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
		// Connect the client to the server	(optional starting in v4.7)
		// await client.connect();

		const userCollection = client.db('talkTroveDB').collection('users');
		const classCollection = client.db('talkTroveDB').collection('classes');
		const selectedClassCollection = client
			.db('talkTroveDB')
			.collection('selectedClasses');
		const paymentCollection = client
			.db('talkTroveDB')
			.collection('payment');

		// Generate client Secret
		app.post('/create-payment-intent', verifyJWT, async (req, res) => {
			const { price } = req.body;
			if (price) {
				const amount = parseFloat(price) * 100;
				const paymentIntent = await stripe.paymentIntents.create({
					amount: amount,
					currency: 'usd',
					payment_method_types: ['card'],
				});
				res.send({ clientSecret: paymentIntent.client_secret });
			}
		});

		app.post('/jwt', (req, res) => {
			const user = req.body;
			const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
				expiresIn: '1h',
			});
			res.send({ token });
		});

		const verifyAdmin = async (req, res, next) => {
			const email = req.decoded.email;
			const query = { email: email };
			const user = await userCollection.findOne(query);
			if (user?.role !== 'admin') {
				return res
					.status(403)
					.send({ error: true, message: 'forbidden access' });
			}
			next();
		};

		const verifyInstructor = async (req, res, next) => {
			const email = req.decoded.email;
			const query = { email: email };
			const user = await userCollection.findOne(query);
			if (user?.role !== 'instructor') {
				return res
					.status(403)
					.send({ error: true, message: 'forbidden access' });
			}
			next();
		};
		// This is under classes related api, But It only works here

		app.get('/classes/approved', async (req, res) => {
			const query = { status: 'approved' };
			const result = await classCollection.find(query).toArray();
			res.send(result);
		});

		// user related Api
		app.get('/users', verifyJWT, verifyAdmin, async (req, res) => {
			const result = await userCollection.find().toArray();
			res.send(result);
		});

		app.post('/users', async (req, res) => {
			const user = req.body;
			const query = { email: user.email };
			const existingUser = await userCollection.findOne(query);
			if (existingUser) {
				return res.send({ message: 'user already exists' });
			}
			const result = await userCollection.insertOne(user);
			res.send(result);
		});

		app.get('/users/instructors', async (req, res) => {
			const query = { role: 'instructor' };
			const result = await userCollection.find(query).toArray();
			res.send(result);
		});
		app.get('/popularinstructors', async (req, res) => {
			const query = { role: 'instructor' };
			const result = await userCollection.find(query).limit(6).toArray();
			res.send(result);
		});

		app.get('/users/admin/:email', verifyJWT, async (req, res) => {
			const email = req.params.email;

			if (req.decoded.email !== email) {
				res.send({ admin: false });
			}

			const query = { email: email };
			const user = await userCollection.findOne(query);
			const result = { admin: user?.role === 'admin' };
			res.send(result);
		});

		app.patch('/users/admin/:id', async (req, res) => {
			const id = req.params.id;
			const filter = { _id: new ObjectId(id) };
			const updateDoc = {
				$set: {
					role: 'admin',
				},
			};
			const result = await userCollection.updateOne(filter, updateDoc);
			res.send(result);
		});

		app.get('/users/instructor/:email', verifyJWT, async (req, res) => {
			const email = req.params.email;

			if (req.decoded.email !== email) {
				res.send({ instructor: false });
			}

			const query = { email: email };
			const user = await userCollection.findOne(query);
			const result = { instructor: user?.role === 'instructor' };
			res.send(result);
		});

		app.patch('/users/instructor/:id', async (req, res) => {
			const id = req.params.id;
			const filter = { _id: new ObjectId(id) };
			const updateDoc = {
				$set: {
					role: 'instructor',
				},
			};
			const result = await userCollection.updateOne(filter, updateDoc);
			res.send(result);
		});

		// Classes Related Api
		app.get('/popularclasses', async (req, res) => {
			const result = await classCollection
				.find()
				.sort({ enrolledStudents: -1 })
				.limit(6)
				.toArray();
			res.send(result);
		});

		app.get('/classes', verifyJWT, verifyAdmin, async (req, res) => {
			const result = await classCollection.find().toArray();
			res.send(result);
		});

		app.get(
			'/classes/:email',
			verifyJWT,
			verifyInstructor,
			async (req, res) => {
				const email = req.params.email;
				const query = { instructorEmail: email };
				const result = await classCollection.find(query).toArray();
				res.send(result);
			}
		);

		app.post('/classes', verifyJWT, verifyInstructor, async (req, res) => {
			const newClass = req.body;
			const result = await classCollection.insertOne(newClass);
			res.send(result);
		});

		app.patch('/classes/approve/:id', async (req, res) => {
			const id = req.params.id;
			const filter = { _id: new ObjectId(id) };
			const updateDoc = {
				$set: {
					status: 'approved',
				},
			};
			const result = await classCollection.updateOne(filter, updateDoc);
			res.send(result);
		});
		app.patch('/classes/deny/:id', async (req, res) => {
			const id = req.params.id;
			const filter = { _id: new ObjectId(id) };
			const updateDoc = {
				$set: {
					status: 'deny',
				},
			};
			const result = await classCollection.updateOne(filter, updateDoc);
			res.send(result);
		});

		app.patch('/classes/feedback/:id', async (req, res) => {
			const feedback = req.body.feedback;
			const id = req.params.id;
			const filter = { _id: new ObjectId(id) };
			const updateDoc = {
				$set: {
					feedback: feedback,
				},
			};
			const result = await classCollection.updateOne(filter, updateDoc);
			res.send(result);
		});

		// Selected Class related Api

		app.get('/selectedClasses/:email', verifyJWT, async (req, res) => {
			const email = req.params.email;
			const query = { studentEmail: email };
			const result = await selectedClassCollection.find(query).toArray();
			res.send(result);
		});

		app.post('/selectedClasses', verifyJWT, async (req, res) => {
			const selectedClass = req.body;
			const result = await selectedClassCollection.insertOne(
				selectedClass
			);
			res.send(result);
		});

		app.delete('/selectedClasses/:id', verifyJWT, async (req, res) => {
			const id = req.params.id;
			const query = { _id: new ObjectId(id) };
			const result = await selectedClassCollection.deleteOne(query);
			res.send(result);
		});

		// Payment related api

		app.get('/myenrolledclasses/:email', verifyJWT, async (req, res) => {
			const email = req.params.email;
			const query = { studentEmail: email };
			const result = await paymentCollection.find(query).toArray();
			res.send(result);
		});

		app.get(
			'/payments/paymenthistory/:email',
			verifyJWT,
			async (req, res) => {
				const email = req.params.email;
				const query = { studentEmail: email };
				const result = await paymentCollection
					.find(query)
					.sort({ date: -1 })
					.toArray();
				res.send(result);
			}
		);

		app.post('/payments', verifyJWT, async (req, res) => {
			const paymentInfo = req.body;
			const insertResult = await paymentCollection.insertOne(paymentInfo);
			const query = { _id: new ObjectId(paymentInfo._id) };
			const deleteResult = await selectedClassCollection.deleteOne(query);
			const filter = { _id: new ObjectId(paymentInfo.classId) };
			const updateDoc = {
				$set: {
					availableSeats: paymentInfo.availableSeats - 1,
				},
				$inc: {
					enrolledStudents: 1,
				},
			};
			const updateResult = await classCollection.updateOne(
				filter,
				updateDoc
			);
			res.send({ insertResult, deleteResult, updateResult });
		});

		// Send a ping to confirm a successful connection
		await client.db('admin').command({ ping: 1 });
		console.log(
			'Pinged your deployment. You successfully connected to MongoDB!'
		);
	} finally {
		// Ensures that the client will close when you finish/error
		// await client.close();
	}
}
run().catch(console.dir);
// End of MongoDB

app.get('/', (req, res) => {
	res.send('Server is Running');
});

app.listen(port, () => {
	console.log(`Server is running on port : ${port}`);
});
