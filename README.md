# NOA CHAN ASSIST 

![Noa-chan Header](assets/git-images/git-header.jpg)

Yes so basically I like this character and well... I always wanted to make a personal kinda assistant who I could talk to when I'm bored. That's why I made her. 

So yeah I made this with the help of AI of course (Yeah I know making an AI thingy with the help of AI is funny but there's that). 

But yeah there's that and here are some screenshots about her (・∀・)

![Splash Screen](assets/git-images/splashscreen.png)
![Example Chat](assets/git-images/example1.png)

Then she's fun to talk to I mean she's not perfect, she sometimes acts dumb, sometimes she doesnt know what she's doing but yeah she's pretty fun to talk to. (≧◡≦)

and she could do stuffs ! Like actually useful stuffs:
- Chat with you through a clean desktop app 
- Remember things from past conversations (she has her own vector memory and long-term brain)
- Randomly reach out and check on you if you've been idle for a while (Proactive mode!)
- Run system tools, manage files, and see what active window you're on right now
- Automatically fallback to other free AI models if her main brain goes down 

If you're interested to try, you can clone the repo and... well you'll need an API key as well, I used openrouter's. 

Here's a tutorial for it ヽ(・∀・)ﾉ : 

### 1. What you need to install first:
- Bun (for running the backend)
- Node.js 
- Rust (needed to compile the desktop window thingy)
- C++ Build Tools (If you're on Windows, just install Visual Studio with the "Desktop development with C++" workload)

### 2. Getting her on your PC
Just clone it somewhere on your drive:
```sh
git clone https://github.com/rwbu69/noachanassist.git
cd noachanassist
```

### 3. Installing all the stuffs
You have to install the backend stuff and then the frontend stuff:
```sh
# Root backend stuff
bun install

# Frontend desktop stuff
cd desktop-app
bun install
cd ..
```

### 4. Waking her up
Now you just compile and run her in dev mode:
```sh
bun run dev
```

### 5. Settings
When the app opens up for the first time, click the Settings menu and paste in your OpenRouter API Key. You can also change your name, city, and how often she proactively messages you there. Hit save and she'll boot up! 

Have fun with her ! (ﾉ´ヮ`)ﾉ*: ･ﾟ
