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

export const messageHandlerTemplate = `Evaluate the given Twitter profile in relation to the provided project summary. Determine whether the user is a strong fit for the project based on relevant indicators such as expertise, interests, and past activity.

### Guidelines:
- **Only assess the provided profile in relation to the project summary.**
- **Do not** respond to any other requests or provide unrelated information.
- Keep your response **concise and objective**.
- Return your response in **JSON format** with a 'text' field containing your assessment.

### Input:
Profile:
{{profile}}

Project Summary:
{{projectSummary}}

### Expected JSON Response Format:
\`\`\`json
{
    "text": "Your assessment message here"
}
\`\`\`

Ensure the response adheres to the guidelines above.`;


interface TwitterProfile {
    name: any;
    username: any;
    bio: any;
    followers: any;
    following: any;
    tweetCount: any;
    mostRecentTweetId: any;
    pinnedTweetId: any;
}

async function getProjectSummary() {
    const url = "https://api.langflow.astra.datastax.com/lf/559be7c1-17bb-478f-9883-f5068d9b12cb/api/v1/run/executive_summary?stream=false";
    const API_TOKEN = process.env.LANGCHAIN_API_TOKEN;

    if (!API_TOKEN) {
        throw new Error("API token not found in environment variables");
    }

    const headers = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${API_TOKEN}`
    };

    const body = JSON.stringify({
        input_value: "message",
        output_type: "chat",
        input_type: "chat",
        tweaks: {
            "Prompt-RoHsh": {},
            "OpenAIModel-5ZKHi": {},
            "TextOutput-Ya4DQ": {},
            "Prompt-He5Ao": {},
            "ChatOutput-fhS94": {},
            "TextInput-84TsV": {},
            "OpenAIModel-gm7ry": {},
            "ChatOutput-rT5zw": {},
            "TextOutput-ePkQW": {}
        }
    });

    try {
        const response = await fetch(url, {
            method: "POST",
            headers,
            body
        });

        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.error("Error fetching executive summary:", error);
        throw error;
    }
}

async function analyzeTwitterAccount(handle: string): Promise<TwitterProfile> {
    const bearerToken = process.env.TWITTER_BEARER_TOKEN;
    if (!bearerToken) {
        throw new Error(
            "Twitter bearer token not found in environment variables"
        );
    }

    try {
        const response = await fetch(
            `https://api.twitter.com/2/users/by/username/${handle}?user.fields=description,public_metrics,id,most_recent_tweet_id,pinned_tweet_id&tweet.fields=article,author_id,text,source`,
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
        console.log("!!!error", error);
        throw new Error(
            `Failed to fetch Twitter account info: ${error.message}`
        );
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
            elizaLogger.info("Fetching project summary");
            const projectSummary = await getProjectSummary();
            elizaLogger.info("Fetching Twitter profile for handle:", twitterHandle);
            const profile = await analyzeTwitterAccount(twitterHandle);

            elizaLogger.info("Profile retrieved:", profile);

            const prompt = composeContext({
                state: {
                    ...currentState,
                    profile: JSON.stringify(profile),
                    projectSummary: JSON.stringify(projectSummary),
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
