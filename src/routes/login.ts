// In login.ts
import { Request, Response } from "express";
import { getDB } from "../util/db";
import { signJWT } from "../util/functions";
import { UserCol, UserOnClientProj } from "../util/types";
import { google } from 'googleapis';
const oauth2Client = new google.auth.OAuth2(
	process.env.GOOGLE_CLIENT_ID,
	process.env.GOOGLE_CLIENT_SECRET
);

async function verifyGoogleAccessToken(accesstoken: string) {
	try {
		const ticket = await oauth2Client.verifyIdToken({
			idToken: accesstoken,
			audience: process.env.GOOGLE_CLIENT_ID,
		});
		return ticket.getPayload();
	} catch (error) {
		console.error('Error verifying Google token:', error);
		return null;
	}
}

export default async function login(req: Request, res: Response) {
	// Get token from request body
	const { token, user: userData } = req.body;
	if (!token) {
		return res.status(401).json({ error: "No authentication token provided" });
	}
	if (!userData) {
		return res.status(401).json({ error: "Invalid user data" });
	}
	const db = getDB();

	try {
		// Update or create user
		await db.collection("Users").updateOne(
			{ email: userData.email },
			{
				$setOnInsert: {
					name: userData.name,
					email: userData.email,
					clan: null,
					role: "User",
					createdAt: new Date()
				},
				$set: { lastVisit: new Date() },
				$inc: { visits: 1 }
			},
			{ upsert: true }
		);
		// Get the user with projection
		const user = await db.collection<UserCol>("Users").findOne(
			{ email: userData.email },
			{ projection: UserOnClientProj }
		);

		if (!user) {
			return res.status(500).json({ error: "Failed to create/find user" });
		}

		// Create JWT
		const jwtToken = await signJWT(user);

		// Return the JWT and user data
		return res.json({
			token: jwtToken,
			user: {
				id: user._id.toString(),
				name: user.name,
				email: user.email,
				role: user.role,
				clan: user.clan
			}
		});

	} catch (error: any) {
		console.error('Login error:', error);
		if (error.code === 40) { // MongoDB duplicate key error
			// Handle the update conflict
			await db.collection("Users").updateOne(
				{ email: userData.email },
				{
					$set: { lastVisit: new Date() },
					$inc: { visits: 1 }
				}
			);
		} else {
			return res.status(500).json({
				error: "Internal server error",
				details: error.message
			});
		}
	}
}