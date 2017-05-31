var ConversationV1 = require('watson-developer-cloud/conversation/v1');
var NaturalLanguageUnderstandingV1 = require('watson-developer-cloud/natural-language-understanding/v1.js');
var DiscoveryV1 = require('watson-developer-cloud/discovery/v1');
var chrono = require('chrono-node')
var format = require('date-format');
var TJBot = require('tjbot');
var config = require('./config');

var credentials = config.credentials;

var hardware = ['microphone', 'speaker'];

var tjConfig = {
    log: {
        level: 'verbose'
    }
};

var tj = new TJBot(hardware, tjConfig, credentials);

Array.prototype.remove = function() {
    var what, a = arguments, L = a.length, ax;
    while (L && this.length) {
        what = a[--L];
        while ((ax = this.indexOf(what)) !== -1) {
            this.splice(ax, 1);
        }
    }
    return this;
};

var context = {};
var oldFilter = [];

var conversation = new ConversationV1({
  username: '',
  password: '',
  version_date: ConversationV1.VERSION_DATE_2017_04_21
});

var nlu = new NaturalLanguageUnderstandingV1({
  username: '',
  password: '',
  version_date: NaturalLanguageUnderstandingV1.VERSION_DATE_2017_02_27
});

var discovery = new DiscoveryV1({
  username: '',
  password: '',
  version_date: DiscoveryV1.VERSION_DATE_2017_04_27
});

var read = function(answer) {
  var debug = false;
  if (process.argv[2]) {
    debug = process.argv[2] == "--debug";
  }
  nlu.analyze({
    'html': answer,
    'features': {
      'entities': {'model': '10:694708fa-0411-4761-9c5f-396346861b66'}
    },
    'language': 'en'
  }, function(err, NLUResponse) {
    // Initialize all keyword types.
    var decidedTopic = "";
    var decidedDate = "";
    var decidedAuthor = "";
    var decidedKeyword = "";
    var specifyParams;
    if (NLUResponse) {
      // Extract and find all keywords.
      NLUResponse.entities.forEach(function(val) {
        if (debug) {
          console.log("FOUND " + val.type + ": " + val.text);
        }
        if (val.type == "TOPIC") {
          decidedTopic = val.text;
        } else if (val.type == "DATE") {
          decidedDate = val.text;
          specifyParams = 1;
        } else if (val.type == "AUTHOR") {
          decidedAuthor = val.text;
          specifyParams = 1;
        } else if (val.type == "KEYWORD") {
          decidedKeyword = val.text;
          specifyParams = 1;
        }
      });
    }
    // Build the filter for Discovery.
    var filter = [];
    if (context.news) {} else {
      context.news = {};
    }
    if (decidedTopic != "") {
      // If the user is looking for a new topic, erase previous context (if exists).
      context.news = {};
      context.news.topic = decidedTopic;
      context.news.date = decidedDate;
      context.news.author = decidedAuthor;
      context.news.keyword = decidedKeyword;
    } else {
      // Else, if the user is narrowing or specifying from a previous query, restore previous filter, and keep context.
      filter = oldFilter;
    }
    // Change keywords in context if they've changed with this message.
    if (decidedTopic != "") {
      context.news.topic = decidedTopic;
    }
    if (decidedDate != "") {
      context.news.date = decidedDate;
    }
    if (decidedAuthor != "") {
      context.news.author = decidedAuthor;
    }
    if (decidedKeyword != "") {
      context.news.author = decidedKeyword;
    }
    // Refresh the context for new news.
    context.news.specifyParams = specifyParams;
    context.news.title1 = "";
    context.news.title2 = "";
    context.news.title3 = "";
    context.news.title4 = "";
    context.news.title5 = "";
    // Build the filter array from decided filters.
    if (decidedDate != "") {
      filter.push('yyyymmdd:"' + format.asString('yyyyMMdd', chrono.parseDate(decidedDate)) + '"');
    } else {
      filter.push('');
    }
    if (decidedAuthor != "") {
      filter.push('author=\'' + decidedAuthor + "\'");
    } else {
      filter.push('');
    }
    if (decidedKeyword != "") {
      filter.push('keywords.text=\'' + decidedKeyword + '\'');
    } else {
      filter.push('');
    }
    oldFilter = filter;
    if (debug) {
      console.log("FILTER: " + filter);
    }
    // Call Discovery.
    discovery.query({
      environment_id: '6a19cc56-a868-4d1c-bbd8-8c15154ad7cb',
      collection_id: '688cca03-4e23-40c1-b6a4-b501ab8cbcd0',
      query: context.news.topic, // Set the topic from the context.
      filter: filter.remove('').join(',') // Join the filter into a string after removing blank elements.
    }, function(err, discoveryResponse) {
      // Parse the news from Discovery.
      var index = 1;
      discoveryResponse.results.forEach(function(val) {
        if (debug) {
          console.log(index);
        }
        if (index <= 5) {
          context.news.hasResults = 1;
          context.news["title" + index] = val.title;
          index += 1;
        }
      });
      if (debug) {
        console.log(context);
      }
      // Send all information to Conversation.
      conversation.message({
        input: { text: answer },
        workspace_id: 'bc61732c-c687-47a3-962e-84a877add664',
        context: context
      }, function(err, response) {
        if (debug) {
          console.log(response);
          console.log(err);
        }
        // Loop infinitely on after printing Watson's response!
        tj.speak(response.output.text[0]);
        console.log('Watson: ' + response.output.text[0]);
        context = response.context;
      });
    });
  });
};

tj.listen(function(msg) {
  if (msg.startsWith("Thomas")) {
    var turn = msg.toLowerCase().replace("thomas", "");
    read(turn);
  }
});
