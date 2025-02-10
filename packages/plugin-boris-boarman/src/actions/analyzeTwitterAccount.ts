import {
    type Action,
    type ActionExample,
    composeContext,
    elizaLogger,
    generateMessageResponse,
    type HandlerCallback,
    type IAgentRuntime,
    type Memory,
    ModelClass,
    type State
} from "@elizaos/core";

export const messageHandlerTemplate = `You are a Venture Capital analyst evaluating startup founders. Your goal is to generate a numeric score based on the founder's experience, industry relevance, and execution capability.

### Scoring Criteria:
1. **Experience Score (1-10)**: Evaluate years of relevant experience, past startup roles, and industry background.
2. **Industry Relevance Score (1-10)**: Assess whether the founder’s expertise aligns with their startup’s domain.
3. **Execution Capability Score (1-10)**: Analyze their track record, social presence, and ability to build and scale products.

### Instructions:
- Provide a JSON response with three scores.
- Keep your assessment concise but informative.
- Do not continue the conversation beyond the evaluation.

### Profile:
{{profile}}

### Example response format:
{
    "experience_score": 8,
    "industry_relevance_score": 9,
    "execution_capability_score": 7,
    "text": "This founder has strong experience in fintech (8/10), highly relevant industry background (9/10), and good execution capability (7/10) based on prior roles."
}`;

interface TwitterProfile {
    name: string;
    username: string;
    bio: string;
    followers: number;
    following: number;
    tweetCount: number;
    mostRecentTweetId?: string;
    pinnedTweetId?: string;
}

async function analyzeTwitterAccount(handle: string): Promise<TwitterProfile> {
    const bearerToken = process.env.TWITTER_BEARER_TOKEN;
    if (!bearerToken) {
        throw new Error("Twitter bearer token not found in environment variables");
    }

    try {
        const response = await fetch(
          `https://api.twitter.com/2/users/by/username/${handle}?user.fields=description,public_metrics,id`,
          {
              headers: {
                  Authorization: `Bearer ${bearerToken}`,
                  "Content-Type": "application/json",
              },
          }
        );

        if (!response.ok) {
            throw new Error(`Twitter API error: ${response.statusText}`);
        }

        const data = await response.json();
        if (!data.data) {
            throw new Error("User not found");
        }

        const user = data.data;
        return {
            name: user.name,
            username: user.username,
            bio: user.description || "No bio available",
            followers: user.public_metrics?.followers_count || 0,
            following: user.public_metrics?.following_count || 0,
            tweetCount: user.public_metrics?.tweet_count || 0,
            mostRecentTweetId: user.most_recent_tweet_id || "N/A",
            pinnedTweetId: user.pinned_tweet_id || "N/A",
        };
    } catch (error) {
        console.error("Error fetching Twitter profile:", error);
        throw new Error(`Failed to fetch Twitter account info: ${error.message}`);
    }
}

export const analyzeTwitterAccountAction = {
    name: "ANALYZE_TWITTER_ACCOUNT",
    description: "Fetch and analyze a user's Twitter information",
    similes: [
        "check twitter",
        "look up twitter",
        "analyze twitter",
        "get twitter bio",
    ],

    async validate(runtime: IAgentRuntime, message: Memory) {
        const twitterHandle = message.content.text?.match(/@(\w+)/)?.[1];
        elizaLogger.info("Validating Twitter handle:", twitterHandle);
        return Boolean(twitterHandle);
    },

    async handler(
        runtime: IAgentRuntime,
        message: Memory,
        state: State,
        options: any,
        callback: HandlerCallback
    ) {
        // Initialize or update state
        let currentState = state;
        if (!currentState) {
            currentState = (await runtime.composeState(message)) as State;
        } else {
            currentState = await runtime.updateRecentMessageState(currentState);
        }

        const twitterHandle = message.content.text?.match(/@(\w+)/)?.[1];

        if (!twitterHandle) {
            return callback(null, {
                content: {
                    text: "I couldn't find a Twitter handle in your message. Please share it starting with @, like @example.",
                },
            });
        }

        try {
            elizaLogger.info("Fetching Twitter profile for handle:", twitterHandle);
            const profile = await analyzeTwitterAccount(twitterHandle);

            elizaLogger.info("Profile retrieved:", profile);

            const prompt = composeContext({
                state: {
                    ...currentState,
                    profile: JSON.stringify(profile),
                },
                template: messageHandlerTemplate,
            });

            elizaLogger.info("Generated prompt:", prompt);

            const response = await generateMessageResponse({
                runtime,
                context: prompt,
                modelClass: ModelClass.SMALL,
            });

            elizaLogger.info("Generated response:", response);

            return callback({
                text: response.text,
            })
        } catch (error) {
            console.log("///error", error);
            elizaLogger.error("Error fetching Twitter bio:", error);
            return callback({
                text: "I apologize, but I'm having trouble accessing Twitter at the moment.",
            });
        }
    },

    examples: [
        [
            {
                user: "user1",
                content: {
                    text: "Can you check out my Twitter? I'm @techie_person",
                },
            },
            {
                user: "boris_boarman_agent",
                content: {
                    text: "I see from your Twitter bio that you're a software engineer passionate about AI and open source! That's fascinating. I'd love to hear more about the open source projects you're working on. Have you been involved in any AI-related projects lately?",
                },
            },
        ],
        [
            {
                user: "user1",
                content: {
                    text: "My Twitter handle is @nature_lover99",
                },
            },
            {
                user: "boris_boarman_agent",
                content: {
                    text: "Ah, your bio shows you're really into wildlife photography and environmental conservation! That's wonderful. What inspired you to start photographing nature? I'd love to hear about your favorite capture!",
                },
            },
        ],
    ] as ActionExample[][],
} as Action;
