'use strict';

require('dotenv').config();
const line = require('@line/bot-sdk');
const express = require('express');
const unirest = require('unirest');
const stripHtml = require("string-strip-html");

const config = {
    channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
    channelSecret: process.env.CHANNEL_SECRET,
    spoonacularSecret: process.env.SPONACULAR_SECRET,
};

const client = new line.Client(config);

const app = express();

app.get('/', (req, res) => {
    res.send('Hello World!');
});

function findRecipe(name) {
    return unirest
        .get("https://api.spoonacular.com/recipes/search")
        .query({
            query: name,
            apiKey: config.spoonacularSecret,
        });
}

function getDetails(id) {
    return unirest
        .get(`https://api.spoonacular.com/recipes/${id}/information`)
        .query({
            apiKey: config.spoonacularSecret,
        });
}

app.post('/webhook', line.middleware(config), (req, res) => {
    Promise
        .all(req.body.events.map(handleEvent))
        .then(result => res.json(result))
        .catch(err => {
            console.log(err);
        });
});

async function handleEvent(event) {
    if (event.type === 'postback') {
        const data = JSON.parse('{"' + decodeURI(event.postback.data).replace(/"/g, '\\"').replace(/&/g, '","').replace(/=/g, '":"') + '"}')

        const echo = [{
            type: 'text',
            text: '',
        },
        {
            type: 'text',
            text: '',
        }];

        await getDetails(data.details)
            .then(response => {
                const data = JSON.parse(response.raw_body);

                data.extendedIngredients.forEach((ingrendient) => {
                    echo[0].text += `${ingrendient.original}\n`;
                });
                echo[0].text = stripHtml(echo[0].text);
                echo[1].text = stripHtml(data.summary) + `\n\nRead here for more: ${data.sourceUrl}`;
            })
            .catch(err => console.log(err));

        return client.replyMessage(event.replyToken, echo);
    }

    if (event.type !== 'message' || event.message.type !== 'text') {
        return Promise.resolve(null);
    }

    if (!event.message.text.startsWith("/")) {
        return Promise.resolve(null);
    }

    if (!event.message.text.startsWith("/recipe") && !event.message.text.startsWith("/help")) {
        return client.replyMessage(event.replyToken, { type: 'text', text: 'Error, command not found. Type /help for help' });
    }

    if (event.message.text.startsWith("/help")) {
        return client.replyMessage(event.replyToken, { type: 'text', text: 'Available menu:\n/recipe <MENU NAME> e.g /recipe burger' });
    }

    const recipeName = event.message.text.slice(8);

    if (recipeName === "") {
        return client.replyMessage(event.replyToken, { type: 'text', text: 'Error, empty recipe name' });
    }

    const echo = {
        type: 'template',
        altText: recipeName,
        template: {
            type: 'carousel',
            columns: []
        }
    };

    await findRecipe(recipeName)
        .then(response => {
            const data = JSON.parse(response.raw_body);

            data.results.slice(0, Math.min(data.results.length, 10)).forEach(recipe => {
                let acc = {};
                acc.thumbnailImageUrl = 'https://spoonacular.com/recipeImages/' + recipe.image;
                acc.title = recipe.title.substring(0, Math.min(35, recipe.title.length));
                acc.text = recipe.title.substring(0, Math.min(35, recipe.title.length));
                acc.actions = [{}];
                acc.actions[0].type = 'postback';
                acc.actions[0].data = 'details=' + recipe.id;
                acc.actions[0].label = 'Details';

                echo.template.columns.push(acc);
            });
        })
        .catch(err => console.log(err));

    if (echo.template.columns.length === 0) {
        return client.replyMessage(event.replyToken, { type: 'text', text: 'Not found' });
    }

    return client.replyMessage(event.replyToken, echo);
}

const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`listening on ${port}`);
});
