/* =========================================================
   REVISEGO — APP.JS
========================================================= */


/* =========================================================
   GAME VARIABLES
========================================================= */

let currentSubject = "";
let currentQuestions = [];

let currentQuestion = 0;

let score = 0;
let xp = 0;

let lives = 3;

let combo = 0;
let bestCombo = 0;

let correctAnswers = 0;

let questionsPlayed = 0;

let timer;
let timeLeft = 15;

const TOTAL_QUESTIONS = 10;


/* =========================================================
   PREMIUM SYSTEM
========================================================= */

/*
    Premium is NOT unlocked by clicking the button.

    When we add a real payment system later, successful
    payment will set this value to true.

    Example:

    localStorage.setItem(
        "reviseGoPremium",
        "true"
    );
*/

function isPremiumUnlocked() {

    return (
        localStorage.getItem(
            "reviseGoPremium"
        ) === "true"
    );
}


/*
    This function is only for checking whether the
    player is allowed to enter a premium game.
*/

function openPremiumGame(gameName) {

    /*
        If the player has already paid/unlocked Premium,
        allow access to the premium game.
    */

    if (isPremiumUnlocked()) {

        startPremiumGame(gameName);

        return;
    }


    const title =
        document.getElementById(
            "premium-title"
        );

    const message =
        document.getElementById(
            "premium-message"
        );


    if (title) {

        title.textContent =
            `${gameName} is Premium`;
    }


    if (message) {

        message.textContent =
            `Unlock ReviseGo Premium to play ${gameName}.`;
    }


    /*
        Store which premium game the player wanted.
    */

    localStorage.setItem(
        "reviseGoPremiumGame",
        gameName
    );


    updatePremiumScreen();

    showScreen("premium-screen");
}


/*
    This is deliberately NOT an automatic unlock.

    When we connect Stripe or another payment provider,
    the successful payment will call unlockPremium().
*/

function unlockPremium() {

    /*
        DO NOT remove this protection.

        The actual payment provider will be connected here
        later.
    */

    alert(
        "Premium payments aren't connected yet. Once payment is set up, your purchase will unlock Boss Battle, Speed Run and future Premium games."
    );
}


/*
    This function is what will run AFTER a successful
    payment in the future.

    For now it is available so the payment system has
    somewhere to connect to.
*/

function confirmPremiumPurchase() {

    localStorage.setItem(
        "reviseGoPremium",
        "true"
    );

    updatePremiumScreen();

    alert(
        "Premium unlocked!"
    );

    showScreen("home-screen");

    updateLevelDisplay();
}


/*
    Update the Premium page depending on whether the
    player has Premium.
*/

function updatePremiumScreen() {

    const premiumButton =
        document.querySelector(
            ".premium-button"
        );

    const premiumNote =
        document.querySelector(
            ".premium-note"
        );

    const premiumTitle =
        document.getElementById(
            "premium-title"
        );

    const premiumMessage =
        document.getElementById(
            "premium-message"
        );


    if (isPremiumUnlocked()) {

        if (premiumTitle) {

            premiumTitle.textContent =
                "Premium Unlocked";
        }


        if (premiumMessage) {

            premiumMessage.textContent =
                "You now have access to Boss Battle, Speed Run and future Premium games.";
        }


        if (premiumButton) {

            premiumButton.textContent =
                "Premium Unlocked";

            premiumButton.disabled =
                true;
        }


        if (premiumNote) {

            premiumNote.textContent =
                "Your Premium access is active on this device.";
        }

    } else {

        if (premiumButton) {

            premiumButton.textContent =
                "Unlock Premium";

            premiumButton.disabled =
                false;
        }


        if (premiumNote) {

            premiumNote.textContent =
                "Premium games require a purchase.";
        }
    }
}


/*
    Placeholder for the future premium game system.

    Once Premium is actually purchased, this can launch
    the appropriate game.
*/

function startPremiumGame(gameName) {

    alert(
        `${gameName} is unlocked! The Premium game itself is coming next.`
    );
}


/* =========================================================
   PLAYER PROFILE SYSTEM
========================================================= */

function getPlayerData() {

    return JSON.parse(
        localStorage.getItem("reviseGoPlayer")
    ) || {

        gamesPlayed: 0,
        questionsAnswered: 0,
        correctAnswers: 0,
        bestComboEver: 0,

        achievements: [],

        streak: 0,
        lastPlayed: null
    };
}


function savePlayerData(player) {

    localStorage.setItem(
        "reviseGoPlayer",
        JSON.stringify(player)
    );
}


/* =========================================================
   SCREEN MANAGEMENT
========================================================= */

function showScreen(screenId) {

    const screens =
        document.querySelectorAll(".screen");


    screens.forEach(screen => {

        screen.classList.remove("active");

    });


    const target =
        document.getElementById(screenId);


    if (!target) {

        console.error(
            "Screen not found:",
            screenId
        );

        return;
    }


    target.classList.add("active");


    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });


    /*
        Refresh Premium screen whenever it opens.
    */

    if (
        screenId ===
        "premium-screen"
    ) {

        updatePremiumScreen();
    }
}


/* =========================================================
   HOME
========================================================= */

function openSubjects() {

    showScreen(
        "subject-screen"
    );
}


/* =========================================================
   LEVEL SYSTEM
========================================================= */

function getLevelFromXP(totalXP) {

    let level = 1;

    let requiredXP = 500;

    let remainingXP = totalXP;


    while (
        remainingXP >=
        requiredXP
    ) {

        remainingXP -=
            requiredXP;

        level++;


        requiredXP =
            Math.round(
                requiredXP * 1.2
            );
    }


    return level;
}


function getXPForNextLevel(totalXP) {

    let requiredXP = 500;

    let remainingXP = totalXP;


    while (
        remainingXP >=
        requiredXP
    ) {

        remainingXP -=
            requiredXP;


        requiredXP =
            Math.round(
                requiredXP * 1.2
            );
    }


    return requiredXP;
}


function getXPIntoLevel(totalXP) {

    let requiredXP = 500;

    let remainingXP = totalXP;


    while (
        remainingXP >=
        requiredXP
    ) {

        remainingXP -=
            requiredXP;


        requiredXP =
            Math.round(
                requiredXP * 1.2
            );
    }


    return remainingXP;
}


/* =========================================================
   UPDATE LEVEL DISPLAYS
========================================================= */

function updateLevelDisplay() {

    const totalXP =
        Number(
            localStorage.getItem(
                "reviseGoXP"
            )
        ) || 0;


    const level =
        getLevelFromXP(totalXP);


    const nextLevelXP =
        getXPForNextLevel(totalXP);


    const currentLevelXP =
        getXPIntoLevel(totalXP);


    const progress =
        (
            currentLevelXP /
            nextLevelXP
        ) * 100;


    document
        .querySelectorAll(
            ".player-level"
        )
        .forEach(element => {

            element.textContent =
                `LEVEL ${level}`;

        });


    document
        .querySelectorAll(
            ".corner-level"
        )
        .forEach(element => {

            element.textContent =
                `LEVEL ${level}`;

        });


    document
        .querySelectorAll(
            "#player-level"
        )
        .forEach(element => {

            element.textContent =
                level;

        });


    document
        .querySelectorAll(
            ".level-xp"
        )
        .forEach(element => {

            element.textContent =
                `${currentLevelXP} / ${nextLevelXP} XP`;

        });


    document
        .querySelectorAll(
            ".level-progress"
        )
        .forEach(bar => {

            bar.style.width =
                `${Math.min(
                    progress,
                    100
                )}%`;

        });


    const totalXPElement =
        document.getElementById(
            "total-xp"
        );


    if (totalXPElement) {

        totalXPElement.textContent =
            totalXP;
    }
}


/* =========================================================
   LEVEL UP
========================================================= */

function checkForLevelUp(
    oldXP,
    newXP
) {

    const oldLevel =
        getLevelFromXP(oldXP);


    const newLevel =
        getLevelFromXP(newXP);


    if (
        newLevel >
        oldLevel
    ) {

        showLevelUp(
            newLevel
        );
    }
}


function showLevelUp(level) {

    const oldPopup =
        document.querySelector(
            ".level-up-popup"
        );


    if (oldPopup) {

        oldPopup.remove();
    }


    const popup =
        document.createElement(
            "div"
        );


    popup.className =
        "level-up-popup";


    popup.innerHTML = `

        <div class="level-up-content">

            <div class="level-up-stars">
                <svg class="icon icon-fill" aria-hidden="true"><use href="#i-star"/></svg>
            </div>

            <div class="level-up-label">
                LEVEL UP!
            </div>

            <div class="level-up-number">
                ${level}
            </div>

            <div class="level-up-message">
                You're getting stronger
            </div>

        </div>

    `;


    document.body.appendChild(
        popup
    );


    setTimeout(() => {

        popup.classList.add(
            "show"
        );

    }, 50);


    setTimeout(() => {

        popup.classList.remove(
            "show"
        );

    }, 5500);


    setTimeout(() => {

        popup.remove();

    }, 6200);
}


/* =========================================================
   START GAME
========================================================= */

function startGame(subject) {

    currentSubject =
        subject;


    const availableQuestions =
        questions.filter(
            question => {

                return (
                    question.subject ===
                    subject
                );

            }
        );


    if (
        availableQuestions.length ===
        0
    ) {

        alert(
            "There aren't any questions for this subject yet!"
        );

        return;
    }


    currentQuestions =
        shuffleArray(
            availableQuestions
        ).slice(
            0,
            TOTAL_QUESTIONS
        );


    while (
        currentQuestions.length <
        TOTAL_QUESTIONS
    ) {

        const extraQuestion =
            availableQuestions[
                Math.floor(
                    Math.random() *
                    availableQuestions.length
                )
            ];


        currentQuestions.push(
            extraQuestion
        );
    }


    currentQuestion = 0;

    score = 0;

    xp = 0;

    lives = 3;

    combo = 0;

    bestCombo = 0;

    correctAnswers = 0;

    questionsPlayed = 0;


    updateGameStats();

    showScreen(
        "game-screen"
    );

    loadQuestion();
}


/* =========================================================
   LOAD QUESTION
========================================================= */

function loadQuestion() {

    clearInterval(timer);

    timeLeft = 15;

    updateTimer();


    if (
        currentQuestion >=
        TOTAL_QUESTIONS
    ) {

        finishGame();

        return;
    }


    const question =
        currentQuestions[
            currentQuestion
        ];


    document
        .getElementById(
            "question-number"
        )
        .textContent =
        currentQuestion + 1;


    document
        .getElementById(
            "question-topic"
        )
        .textContent =
        question.topic;


    document
        .getElementById(
            "question-text"
        )
        .textContent =
        question.question;


    const progress =
        (
            (currentQuestion + 1) /
            TOTAL_QUESTIONS
        ) * 100;


    document
        .getElementById(
            "progress-bar"
        )
        .style.width =
        `${progress}%`;


    const answersContainer =
        document.getElementById(
            "answers"
        );


    answersContainer.innerHTML =
        "";


    const feedback =
        document.getElementById(
            "feedback"
        );


    feedback.textContent =
        "";


    feedback.className =
        "feedback";


    const shuffledOptions =
        question.options.map(
            (
                option,
                originalIndex
            ) => {

                return {
                    option:
                        option,

                    originalIndex:
                        originalIndex
                };

            }
        );


    shuffleArray(
        shuffledOptions
    ).forEach(
        answer => {

            const button =
                document.createElement(
                    "button"
                );


            button.className =
                "answer-button";


            button.textContent =
                answer.option;


            button.onclick = () => {

                answerQuestion(
                    answer.originalIndex,
                    button
                );

            };


            answersContainer
                .appendChild(
                    button
                );

        }
    );


    startTimer();
}


/* =========================================================
   ANSWER QUESTION
========================================================= */

function answerQuestion(
    selectedAnswer,
    selectedButton
) {

    clearInterval(timer);


    const question =
        currentQuestions[
            currentQuestion
        ];


    const answerButtons =
        document.querySelectorAll(
            ".answer-button"
        );


    answerButtons.forEach(
        button => {

            button.disabled =
                true;

        }
    );


    questionsPlayed++;


    const feedback =
        document.getElementById(
            "feedback"
        );


    if (
        selectedAnswer ===
        question.answer
    ) {

        selectedButton
            .classList
            .add("correct");


        correctAnswers++;

        combo++;


        if (
            combo >
            bestCombo
        ) {

            bestCombo =
                combo;
        }


        const baseXP =
            100;


        const comboBonus =
            (
                combo - 1
            ) * 25;


        const earnedXP =
            baseXP +
            comboBonus;


        xp +=
            earnedXP;


        score++;


        feedback.textContent =
            `Correct! +${earnedXP} XP — ${question.explanation}`;


        feedback.classList
            .add("correct");


        showXPPopup(
            earnedXP
        );


        showCombo();

    } else {

        selectedButton
            .classList
            .add("wrong");


        answerButtons.forEach(
            button => {

                if (
                    button.textContent ===
                    question.options[
                        question.answer
                    ]
                ) {

                    button.classList
                        .add("correct");

                }

            }
        );


        lives--;

        combo = 0;


        feedback.textContent =
            `Not quite! ${question.explanation}`;


        feedback.classList
            .add("wrong");


        animateLives();

        updateCombo();
    }


    updateGameStats();


    setTimeout(() => {

        currentQuestion++;


        if (
            lives <= 0
        ) {

            finishGame();

        } else {

            loadQuestion();
        }

    }, 1000);
}


/* =========================================================
   TIMER
========================================================= */

function startTimer() {

    timer =
        setInterval(() => {

            timeLeft--;

            updateTimer();


            if (
                timeLeft <=
                0
            ) {

                clearInterval(
                    timer
                );

                timeRanOut();
            }

        }, 1000);
}


function updateTimer() {

    const timerElement =
        document.getElementById(
            "timer"
        );


    if (!timerElement) {

        return;
    }


    timerElement.textContent =
        timeLeft;


    if (
        timeLeft <= 5
    ) {

        timerElement
            .classList
            .add("warning");

    } else {

        timerElement
            .classList
            .remove("warning");
    }
}


/* =========================================================
   TIME OUT
========================================================= */

function timeRanOut() {

    const question =
        currentQuestions[
            currentQuestion
        ];


    const answerButtons =
        document.querySelectorAll(
            ".answer-button"
        );


    answerButtons.forEach(
        button => {

            button.disabled =
                true;

        }
    );


    questionsPlayed++;


    answerButtons.forEach(
        button => {

            if (
                button.textContent ===
                question.options[
                    question.answer
                ]
            ) {

                button.classList
                    .add("correct");

            }

        }
    );


    lives--;

    combo = 0;


    const feedback =
        document.getElementById(
            "feedback"
        );


    feedback.textContent =
        `⏰ Time's up! ${question.explanation}`;


    feedback.classList
        .add("wrong");


    animateLives();

    updateCombo();

    updateGameStats();


    setTimeout(() => {

        currentQuestion++;


        if (
            lives <= 0
        ) {

            finishGame();

        } else {

            loadQuestion();
        }

    }, 1000);
}


/* =========================================================
   GAME STATS
========================================================= */

function updateGameStats() {

    const livesElement =
        document.getElementById(
            "lives"
        );


    if (livesElement) {

        // CLAMPED, because String.repeat throws a RangeError on a negative count
        // and takes the whole game down with it. `lives` can pass below zero if
        // another answer lands between the last life being lost and the results
        // screen appearing. Clamping is also what makes the value safe to draw.
        //
        // enhance.js replaces this text with SVG hearts immediately afterwards;
        // this stays as the fallback for when that script hasn't loaded.
        const shown =
            Math.max(
                0,
                Math.min(3, lives)
            );

        livesElement.textContent =
            "●".repeat(
                shown
            ) +
            "○".repeat(
                3 - shown
            );
    }


    const comboElement =
        document.getElementById(
            "combo"
        );


    if (comboElement) {

        comboElement.textContent =
            combo;
    }


    const gameXPElement =
        document.getElementById(
            "game-xp"
        );


    if (gameXPElement) {

        gameXPElement.textContent =
            xp;
    }
}


/* =========================================================
   COMBO
========================================================= */

function updateCombo() {

    const comboElement =
        document.getElementById(
            "combo-display"
        );


    if (!comboElement) {

        return;
    }


    comboElement
        .classList
        .remove("hot");
}


function showCombo() {

    const comboElement =
        document.getElementById(
            "combo-display"
        );


    if (!comboElement) {

        return;
    }


    if (
        combo >= 2
    ) {

        comboElement
            .classList
            .remove("hot");


        void comboElement
            .offsetWidth;


        comboElement
            .classList
            .add("hot");
    }
}


/* =========================================================
   LIFE ANIMATION
========================================================= */

function animateLives() {

    const livesElement =
        document.getElementById(
            "lives"
        );


    if (!livesElement) {

        return;
    }


    livesElement
        .classList
        .remove("hit");


    void livesElement
        .offsetWidth;


    livesElement
        .classList
        .add("hit");
}


/* =========================================================
   XP POPUP
========================================================= */

function showXPPopup(
    amount
) {

    const popup =
        document.createElement(
            "div"
        );


    popup.className =
        "xp-popup";


    popup.textContent =
        `+${amount} XP`;


    popup.style.left =
        `${
            50 +
            (
                Math.random() *
                10 -
                5
            )
        }%`;


    popup.style.top =
        "45%";


    document.body.appendChild(
        popup
    );


    setTimeout(() => {

        popup.remove();

    }, 900);
}


/* =========================================================
   STREAK BONUS POPUP
========================================================= */

function showStreakBonus(
    streak,
    bonusXP
) {

    const popup =
        document.createElement(
            "div"
        );


    popup.className =
        "streak-bonus-popup";


    popup.innerHTML = `

        <div class="streak-bonus-fire">
            <svg class="icon icon-fill" aria-hidden="true"><use href="#i-flame"/></svg>
        </div>

        <div>

            <strong>
                ${streak} Day Streak!
            </strong>

            <small>
                +${bonusXP} Bonus XP
            </small>

        </div>

    `;


    document.body.appendChild(
        popup
    );


    setTimeout(() => {

        popup.classList.add(
            "show"
        );

    }, 50);


    setTimeout(() => {

        popup.remove();

    }, 3000);
}


/* =========================================================
   DAILY STREAK SYSTEM
========================================================= */

function updateDailyStreak() {

    const player =
        getPlayerData();


    const today =
        new Date();


    const todayString =
        today
            .toISOString()
            .split("T")[0];


    if (
        !player.lastPlayed
    ) {

        player.streak =
            1;


        player.lastPlayed =
            todayString;


        savePlayerData(
            player
        );


        return {

            streak:
                player.streak,

            bonusXP:
                25,

            isNewDay:
                true
        };
    }


    if (
        player.lastPlayed ===
        todayString
    ) {

        return {

            streak:
                player.streak,

            bonusXP:
                0,

            isNewDay:
                false
        };
    }


    const lastPlayedDate =
        new Date(
            player.lastPlayed +
            "T00:00:00"
        );


    const todayDate =
        new Date(
            todayString +
            "T00:00:00"
        );


    const difference =
        Math.round(
            (
                todayDate -
                lastPlayedDate
            ) /
            (
                1000 *
                60 *
                60 *
                24
            )
        );


    if (
        difference === 1
    ) {

        player.streak++;

    } else if (
        difference > 1
    ) {

        player.streak =
            1;
    }


    player.lastPlayed =
        todayString;


    savePlayerData(
        player
    );


    return {

        streak:
            player.streak,

        bonusXP:
            25,

        isNewDay:
            true
    };
}


/* =========================================================
   FINISH GAME
========================================================= */

function finishGame() {

    clearInterval(timer);


    questionsPlayed =
        Math.min(
            questionsPlayed,
            TOTAL_QUESTIONS
        );


    const percentage =
        Math.round(
            (
                correctAnswers /
                TOTAL_QUESTIONS
            ) * 100
        );


    document
        .getElementById(
            "final-xp"
        )
        .textContent =
        xp;


    document
        .getElementById(
            "final-score"
        )
        .textContent =
        `${percentage}%`;


    document
        .getElementById(
            "final-combo"
        )
        .textContent =
        bestCombo;


    let title;
    let message;
    let icon;


    if (
        percentage >= 90
    ) {

        title =
            "Absolute beast";

        message =
            "That was seriously good.";

        icon =
            "i-trophy";

    } else if (
        percentage >= 70
    ) {

        title =
            "Nice work!";

        message =
            "You've got a solid score.";

        icon =
            "i-bolt";

    } else if (
        percentage >= 50
    ) {

        title =
            "Not bad";

        message =
            "You've got some topics to work on.";

        icon =
            "i-target";

    } else {

        title =
            "We go again";

        message =
            "Don't worry. Keep practising.";

        icon =
            "i-flame";
    }


    document
        .getElementById(
            "result-title"
        )
        .textContent =
        title;


    document
        .getElementById(
            "result-message"
        )
        .textContent =
        message;


    document
        .getElementById(
            "result-icon"
        )
        .textContent =
        icon;


    /* DAILY STREAK */

    const streakResult =
        updateDailyStreak();


    const streakBonus =
        streakResult.bonusXP;


    if (
        streakBonus > 0
    ) {

        xp +=
            streakBonus;


        showStreakBonus(
            streakResult.streak,
            streakBonus
        );
    }


    document
        .getElementById(
            "final-xp"
        )
        .textContent =
        xp;


    /* SAVE XP */

    const oldXP =
        Number(
            localStorage.getItem(
                "reviseGoXP"
            )
        ) || 0;


    const newXP =
        oldXP +
        xp;


    checkForLevelUp(
        oldXP,
        newXP
    );


    saveXP(xp);


    /* PROFILE */

    updatePlayerStats();

    updateStreakDisplay();


    /* RESULTS */

    showScreen(
        "results-screen"
    );
}


/* =========================================================
   RESTART
========================================================= */

function restartGame() {

    startGame(
        currentSubject
    );
}


/* =========================================================
   LEAVE GAME
========================================================= */

function leaveGame() {

    clearInterval(timer);


    showScreen(
        "home-screen"
    );


    updateLevelDisplay();

    updateStreakDisplay();
}


/* =========================================================
   SHUFFLE
========================================================= */

function shuffleArray(
    array
) {

    const shuffled =
        [...array];


    for (
        let i =
            shuffled.length - 1;
        i > 0;
        i--
    ) {

        const randomIndex =
            Math.floor(
                Math.random() *
                (i + 1)
            );


        [
            shuffled[i],
            shuffled[randomIndex]
        ] = [
            shuffled[randomIndex],
            shuffled[i]
        ];
    }


    return shuffled;
}


/* =========================================================
   SAVE XP
========================================================= */

function saveXP(
    amount
) {

    const oldXP =
        Number(
            localStorage.getItem(
                "reviseGoXP"
            )
        ) || 0;


    const newXP =
        oldXP +
        amount;


    localStorage.setItem(
        "reviseGoXP",
        newXP
    );


    const totalXPElement =
        document.getElementById(
            "total-xp"
        );


    if (
        totalXPElement
    ) {

        totalXPElement.textContent =
            newXP;
    }


    updateLevelDisplay();
}


/* =========================================================
   PLAYER STATS
========================================================= */

function updatePlayerStats() {

    const player =
        getPlayerData();


    player.gamesPlayed++;


    player.questionsAnswered +=
        questionsPlayed;


    player.correctAnswers +=
        correctAnswers;


    if (
        bestCombo >
        player.bestComboEver
    ) {

        player.bestComboEver =
            bestCombo;
    }


    savePlayerData(
        player
    );


    checkAchievements();
}


/* =========================================================
   ACHIEVEMENTS
========================================================= */

const achievements = [

    {
        id:
            "first_win",

        name:
            "First Victory",

        condition:
            player =>
                player.gamesPlayed >=
                1
    },


    {
        id:
            "combo_10",

        name:
            "Combo King",

        condition:
            player =>
                player.bestComboEver >=
                10
    },


    {
        id:
            "games_25",

        name:
            "Veteran",

        condition:
            player =>
                player.gamesPlayed >=
                25
    },


    {
        id:
            "questions_100",

        name:
            "Scholar",

        condition:
            player =>
                player.questionsAnswered >=
                100
    },


    {
        id:
            "streak_7",

        name:
            "Week Warrior",

        condition:
            player =>
                player.streak >=
                7
    }

];


function checkAchievements() {

    const player =
        getPlayerData();


    achievements.forEach(
        achievement => {

            const unlocked =
                player.achievements.includes(
                    achievement.id
                );


            if (
                !unlocked &&
                achievement.condition(
                    player
                )
            ) {

                player.achievements.push(
                    achievement.id
                );


                showAchievement(
                    achievement.name
                );
            }

        }
    );


    savePlayerData(
        player
    );
}


function showAchievement(
    name
) {

    const popup =
        document.createElement(
            "div"
        );


    popup.className =
        "achievement-popup";


    popup.innerHTML = `

        <div>
            <svg class="icon " aria-hidden="true"><use href="#i-trophy"/></svg> Achievement Unlocked
        </div>

        <strong>
            ${name}
        </strong>

    `;


    document.body.appendChild(
        popup
    );


    setTimeout(() => {

        popup.remove();

    }, 3500);
}


/* =========================================================
   LOAD PLAYER DATA
========================================================= */

function loadPlayerData() {

    const savedXP =
        Number(
            localStorage.getItem(
                "reviseGoXP"
            )
        ) || 0;


    const totalXPElement =
        document.getElementById(
            "total-xp"
        );


    if (
        totalXPElement
    ) {

        totalXPElement.textContent =
            savedXP;
    }


    updateLevelDisplay();

    updateStreakDisplay();

    updatePremiumScreen();
}


/* =========================================================
   PLAYER PROFILE
========================================================= */

function openProfile() {

    updateProfile();

    showScreen(
        "profile-screen"
    );
}


/* =========================================================
   FIX PROFILE STATISTICS
========================================================= */

function fixProfileStatsLayout() {

    const streakElement =
        document.getElementById(
            "profile-streak"
        );


    if (!streakElement) {

        return;
    }


    const streakCard =
        streakElement.closest(
            ".profile-stat-card"
        );


    const statsGrid =
        document.querySelector(
            ".profile-stat-grid"
        );


    if (
        streakCard &&
        statsGrid &&
        !statsGrid.contains(
            streakCard
        )
    ) {

        statsGrid.appendChild(
            streakCard
        );
    }
}


/* =========================================================
   UPDATE PROFILE
========================================================= */

function updateProfile() {

    fixProfileStatsLayout();


    const player =
        getPlayerData();


    const totalXP =
        Number(
            localStorage.getItem(
                "reviseGoXP"
            )
        ) || 0;


    const level =
        getLevelFromXP(
            totalXP
        );


    const nextLevelXP =
        getXPForNextLevel(
            totalXP
        );


    const currentLevelXP =
        getXPIntoLevel(
            totalXP
        );


    const progress =
        (
            currentLevelXP /
            nextLevelXP
        ) * 100;


    const levelElement =
        document.getElementById(
            "profile-level"
        );


    if (
        levelElement
    ) {

        levelElement.textContent =
            `LEVEL ${level}`;
    }


    const xpElement =
        document.getElementById(
            "profile-xp"
        );


    if (
        xpElement
    ) {

        xpElement.textContent =
            `${currentLevelXP} / ${nextLevelXP} XP`;
    }


    const totalXPElement =
        document.getElementById(
            "profile-total-xp"
        );


    if (
        totalXPElement
    ) {

        totalXPElement.textContent =
            `${totalXP} Total XP`;
    }


    const progressElement =
        document.getElementById(
            "profile-level-progress"
        );


    if (
        progressElement
    ) {

        progressElement.style.width =
            `${Math.min(
                progress,
                100
            )}%`;
    }


    const gamesElement =
        document.getElementById(
            "profile-games"
        );


    if (
        gamesElement
    ) {

        gamesElement.textContent =
            player.gamesPlayed;
    }


    const questionsElement =
        document.getElementById(
            "profile-questions"
        );


    if (
        questionsElement
    ) {

        questionsElement.textContent =
            player.questionsAnswered;
    }


    const correctElement =
        document.getElementById(
            "profile-correct"
        );


    if (
        correctElement
    ) {

        correctElement.textContent =
            player.correctAnswers;
    }


    const comboElement =
        document.getElementById(
            "profile-combo"
        );


    if (
        comboElement
    ) {

        comboElement.textContent =
            player.bestComboEver;
    }


    const profileStreak =
        document.getElementById(
            "profile-streak"
        );


    if (
        profileStreak
    ) {

        profileStreak.textContent =
            player.streak;
    }


    let accuracy = 0;


    if (
        player.questionsAnswered >
        0
    ) {

        accuracy =
            Math.round(
                (
                    player.correctAnswers /
                    player.questionsAnswered
                ) * 100
            );
    }


    const accuracyElement =
        document.getElementById(
            "profile-accuracy"
        );


    if (
        accuracyElement
    ) {

        accuracyElement.textContent =
            `${accuracy}%`;
    }


    renderProfileAchievements();
}


/* =========================================================
   RENDER ACHIEVEMENTS
========================================================= */

function renderProfileAchievements() {

    const container =
        document.getElementById(
            "profile-achievements"
        );


    if (!container) {

        return;
    }


    const player =
        getPlayerData();


    container.innerHTML =
        "";


    achievements.forEach(
        achievement => {

            const unlocked =
                player.achievements.includes(
                    achievement.id
                );


            const card =
                document.createElement(
                    "div"
                );


            card.className =
                unlocked
                    ? "achievement-card unlocked"
                    : "achievement-card locked";


            card.innerHTML = `

                <div class="achievement-icon">

                    ${
                        unlocked
                            ? '<svg class="icon " aria-hidden="true"><use href="#i-trophy"/></svg>'
                            : '<svg class="icon " aria-hidden="true"><use href="#i-lock"/></svg>'
                    }

                </div>

                <div class="achievement-info">

                    <strong>
                        ${achievement.name}
                    </strong>

                    <small>

                        ${
                            unlocked
                                ? "Unlocked"
                                : "Keep playing to unlock"
                        }

                    </small>

                </div>

            `;


            container.appendChild(
                card
            );

        }
    );
}


/* =========================================================
   STREAK DISPLAY
========================================================= */

function updateStreakDisplay() {

    const player =
        getPlayerData();


    document
        .querySelectorAll(
            "#streak"
        )
        .forEach(
            element => {

                element.textContent =
                    player.streak;

            }
        );


    const profileStreak =
        document.getElementById(
            "profile-streak"
        );


    if (
        profileStreak
    ) {

        profileStreak.textContent =
            player.streak;
    }
}


/* =========================================================
   START APP
========================================================= */

loadPlayerData();

updateLevelDisplay();

fixProfileStatsLayout();
