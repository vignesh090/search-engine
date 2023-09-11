var express = require('express')
const fs = require('fs');
const SpellChecker = require('spellchecker');
const { removeStopwords } = require('stopword')
const app = express()
const lemmatizer = require('wink-lemmatizer');
const stemmer = require('@stdlib/nlp-porter-stemmer');
const path = require("path")
app.set('view engine', 'ejs')

app.use(express.static(path.join(__dirname, "/public")))

app.use(express.json());

const PORT = process.env.PORT || 5000;

app.get('/', (req, res) => {
    res.render('index')
});


// Read all the files and store in the array  
// Split by '\r\n'

titles = fs.readFileSync('./PS/titles.txt').toString().split(/\r?\n/)
urls = fs.readFileSync('./PS/urls.txt').toString().split(/\r?\n/)


idf = fs.readFileSync('./PS/idf.txt').toString().split(/\r?\n/)
keywords = fs.readFileSync('./PS/keywords.txt').toString().split(/\r?\n/)
magnitude = fs.readFileSync('./PS/magnitude.txt').toString().split(/\r?\n/)
tf_idf = fs.readFileSync('./PS/tf_idf.txt').toString().split(/\r?\n/)

// Pop as last term is empty string

idf.pop()
keywords.pop()
tf_idf.pop()
magnitude.pop()


// It will help in retrieving word from number
num2word = []
num2word[0] = "zero"
num2word[1] = "one"
num2word[2] = "two"
num2word[3] = "three"
num2word[4] = "four"
num2word[5] = "five"
num2word[6] = "six"
num2word[7] = "seven"
num2word[8] = "eight"
num2word[9] = "nine"


app.get('/search', (req, res) => {

    // get the query string
    var query = req.query.query

    // remove stopwords if any
    query_Words = removeStopwords(query.split(' '))

    QueryWords = []

    queryWords = []

    // Avoid empty strings 
    for (let i = 0; i < query_Words.length; i++) {
    
        if (query_Words[i] != '')
            QueryWords.push(query_Words[i])
    }
   
    console.log(QueryWords)
    let len = QueryWords.length
    for (let i = 0; i < len; i++) {
        
        arr=[]

        // Convert all query words to lowercase and correct any misspelled word 
        QueryWords[i] = QueryWords[i].toLowerCase();
        if (SpellChecker.isMisspelled(QueryWords[i])) {
            corrected_words = SpellChecker.getCorrectionsForMisspelling(QueryWords[i]);
            if (corrected_words.length > 0)
                QueryWords[i] = corrected_words[0].toLowerCase();
        }
        console.log(QueryWords[i])
        // If query word is number, convert it into English Word Format.
        if (isNaN(QueryWords[i]) == false) {
            number=QueryWords[i]
            while (number > 0) {
                arr.push(num2word[number % 10])
                number = number / 10
                number = number | 0
            }
        }
        else{
            arr.push(lemmatizer.verb(QueryWords[i]));
            arr.push(lemmatizer.noun(QueryWords[i]));
            arr.push(lemmatizer.adjective(QueryWords[i]));
            arr.push(stemmer(QueryWords[i]));
        }

        arr= new Set(arr)

        arr.forEach(ele=>{
            queryWords.push(ele)
        })
    }

    console.log(queryWords)

    // calculate the term frequency for each word in the query string
    query_tf = []
    i = 0
    keywords.forEach(element => {
        cnt = 0
        queryWords.forEach(qw => {
            if (qw == element) {
                cnt = cnt + 1
            }
        })
        query_tf[i] = cnt / queryWords.length
        i = i + 1
    });

    // calculate the TF-IDF value

    query_tf_idf = []

    i = 0
    query_magnitude = 0
    query_tf.forEach(element => {
        query_tf_idf[i] = element * idf[i]
        query_magnitude = query_magnitude + query_tf_idf[i] * query_tf_idf[i]
        i++
    })

    query_magnitude = Math.sqrt(query_magnitude)

    cos = []

    for (let i = 0; i < magnitude.length; i++)
        cos[i] = 0

    for (let i = 0; i < tf_idf.length; i++) {
        var cur = (tf_idf[i].split(" "))
        a = Number(cur[0])
        b = Number(cur[1])
        c = Number(cur[2])
        // values are stored in 1-based indexing in the tf-idf file.
        cos[a - 1] = cos[a - 1] + c * query_tf_idf[b - 1]
    }

    final_cos = []
    for (let i = 0; i < magnitude.length; i++) {
        cos[i] = cos[i] / (Number(magnitude[i]) * query_magnitude)

        // store the final cosine values in a pair format. It will help in retrieving the correct document
        final_cos[i] = [Number(cos[i]), Number(i)]
    }

    // sort in decreasing order of cosine-similarity values
    final_cos.sort((a, b) => {
        return Number(b[0]) - Number(a[0])
    })

    // Now create a database of 10 files along with their titles and URLS to send to the search.ejs file.
    // It should have titles, URLs, and Problem Descriptions.

    frequency = 10;

    seq = []

    // It is storing the sequence of problems to be displayed to user.
    for (let i = 0; i < frequency; i++) {
        seq[i] = final_cos[i][1]
    }

    // Read the content of files and store in Array 
    s = []
    for (let i = 0; i < frequency; i++) {
        s[i] = fs.readFileSync('./PS/' + (seq[i] + 1).toString() + '.txt').toString().split('\n')
    }

    _titles = []
    _urls = []
    _statements = []

    for (let i = 0; i < frequency; i++) {

        // If the correlation value is 0 or NaN(Implies no match), than no point in proceeding further(As values are already sorted)
        if (final_cos[i][0] == 0 || isNaN(final_cos[i][0]))
            break;

        _titles[i] = titles[seq[i]];
        _urls[i] = seq[i] + 1;

        // During scraping, initial lines are empty in some files. So iterate till any alphanumeric string is not found.
        let j=0
        _statements[i]=""
        while(j<s[i].length && s[i][j].length<=1)
            j++;

        // Store only first line 
        if(j<s[i].length)
            _statements[i]=s[i][j];  
    }
    // Send to user 
    res.render('search', { query: query, title: _titles, url: _urls, st: _statements })
});


app.get('/PS/:id', (req, res) => {
    filename = req.params.id.toString()
    data = fs.readFileSync('./PS/' + filename + ".txt", 'utf-8').toString().split('\n')
    res.render('description', { title: titles[filename - 1], url: urls[filename - 1], data: data })
});

app.listen(PORT)