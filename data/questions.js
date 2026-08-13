const questions = [

    // ==================================================
    // MATHS — EASY
    // ==================================================

    {
        id: "maths-001",
        subject: "Maths",
        topic: "Number",
        difficulty: "Easy",
        question: "What is 7 + 5?",
        options: ["10", "11", "12", "13"],
        answer: 2,
        explanation: "7 + 5 = 12."
    },

    {
        id: "maths-002",
        subject: "Maths",
        topic: "Number",
        difficulty: "Easy",
        question: "What is 9 × 4?",
        options: ["32", "36", "40", "45"],
        answer: 1,
        explanation: "9 × 4 = 36."
    },

    {
        id: "maths-003",
        subject: "Maths",
        topic: "Number",
        difficulty: "Easy",
        question: "What is 45 ÷ 5?",
        options: ["7", "8", "9", "10"],
        answer: 2,
        explanation: "45 divided by 5 is 9."
    },

    {
        id: "maths-004",
        subject: "Maths",
        topic: "Fractions",
        difficulty: "Easy",
        question: "What is half of 18?",
        options: ["6", "8", "9", "10"],
        answer: 2,
        explanation: "18 ÷ 2 = 9."
    },

    {
        id: "maths-005",
        subject: "Maths",
        topic: "Decimals",
        difficulty: "Easy",
        question: "What is 0.5 + 0.25?",
        options: ["0.55", "0.65", "0.75", "0.85"],
        answer: 2,
        explanation: "0.50 + 0.25 = 0.75."
    },

    {
        id: "maths-006",
        subject: "Maths",
        topic: "Percentages",
        difficulty: "Easy",
        question: "What is 10% of 80?",
        options: ["4", "8", "10", "16"],
        answer: 1,
        explanation: "10% of 80 is 8."
    },


    // ==================================================
    // MATHS — MEDIUM
    // ==================================================

    {
        id: "maths-007",
        subject: "Maths",
        topic: "Algebra",
        difficulty: "Medium",
        question: "Solve: x + 7 = 15",
        options: ["6", "7", "8", "9"],
        answer: 2,
        explanation: "Subtract 7 from both sides. x = 8."
    },

    {
        id: "maths-008",
        subject: "Maths",
        topic: "Percentages",
        difficulty: "Medium",
        question: "What is 20% of 80?",
        options: ["12", "16", "18", "20"],
        answer: 1,
        explanation: "20% of 80 = 16."
    },

    {
        id: "maths-009",
        subject: "Maths",
        topic: "Ratio",
        difficulty: "Medium",
        question: "Simplify the ratio 12 : 18.",
        options: [
            "2 : 3",
            "3 : 4",
            "4 : 5",
            "6 : 9"
        ],
        answer: 0,
        explanation: "Divide both parts by 6. The answer is 2 : 3."
    },

    {
        id: "maths-010",
        subject: "Maths",
        topic: "Angles",
        difficulty: "Medium",
        question: "Angles on a straight line add up to...",
        options: [
            "90°",
            "180°",
            "270°",
            "360°"
        ],
        answer: 1,
        explanation: "Angles on a straight line add up to 180°."
    },

    {
        id: "maths-011",
        subject: "Maths",
        topic: "Algebra",
        difficulty: "Medium",
        question: "If x = 6, what is 3x + 2?",
        options: ["18", "20", "22", "24"],
        answer: 1,
        explanation: "3 × 6 + 2 = 20."
    },

    {
        id: "maths-012",
        subject: "Maths",
        topic: "Number",
        difficulty: "Medium",
        question: "What is the highest common factor of 18 and 24?",
        options: ["3", "6", "8", "12"],
        answer: 1,
        explanation: "6 is the highest number that divides both 18 and 24."
    },


    // ==================================================
    // MATHS — HARD
    // ==================================================

    {
        id: "maths-013",
        subject: "Maths",
        topic: "Algebra",
        difficulty: "Hard",
        question: "Solve: 3x + 7 = 22",
        options: ["3", "5", "7", "9"],
        answer: 1,
        explanation: "Subtract 7 to get 3x = 15. Divide by 3 to get x = 5."
    },

    {
        id: "maths-014",
        subject: "Maths",
        topic: "Percentages",
        difficulty: "Hard",
        question: "A jacket costs £80. It is reduced by 15%. What is the new price?",
        options: ["£64", "£68", "£72", "£74"],
        answer: 1,
        explanation: "15% of £80 is £12. £80 − £12 = £68."
    },

    {
        id: "maths-015",
        subject: "Maths",
        topic: "Number",
        difficulty: "Hard",
        question: "What is the highest common factor of 36 and 48?",
        options: ["6", "8", "12", "16"],
        answer: 2,
        explanation: "12 is the highest number that divides both 36 and 48."
    },

    {
        id: "maths-016",
        subject: "Maths",
        topic: "Algebra",
        difficulty: "Hard",
        question: "Solve: 4x − 5 = 19",
        options: ["4", "5", "6", "7"],
        answer: 2,
        explanation: "Add 5 to get 4x = 24. Divide by 4 to get x = 6."
    },

    {
        id: "maths-017",
        subject: "Maths",
        topic: "Ratio",
        difficulty: "Hard",
        question: "A ratio is 3 : 5. If the smaller amount is 18, what is the larger amount?",
        options: ["24", "27", "30", "36"],
        answer: 2,
        explanation: "3 parts = 18, so 1 part = 6. Five parts = 30."
    },


    // ==================================================
    // MATHS — VERY HARD
    // ==================================================

    {
        id: "maths-018",
        subject: "Maths",
        topic: "Algebra",
        difficulty: "Very Hard",
        question: "Solve: 2(3x − 4) = 22",
        options: ["3", "4", "5", "6"],
        answer: 2,
        explanation: "Expand to 6x − 8 = 22. Therefore 6x = 30 and x = 5."
    },

    {
        id: "maths-019",
        subject: "Maths",
        topic: "Algebra",
        difficulty: "Very Hard",
        question: "Solve: 5x − 3 = 2x + 12",
        options: ["3", "5", "7", "9"],
        answer: 1,
        explanation: "Subtract 2x, add 3, then divide by 3. x = 5."
    },

    {
        id: "maths-020",
        subject: "Maths",
        topic: "Percentages",
        difficulty: "Very Hard",
        question: "A price increases from £80 to £92. What is the percentage increase?",
        options: ["10%", "12%", "15%", "20%"],
        answer: 2,
        explanation: "The increase is £12. £12 ÷ £80 × 100 = 15%."
    },


    // ==================================================
    // SCIENCE — EASY
    // ==================================================

    {
        id: "science-001",
        subject: "Science",
        topic: "Biology",
        difficulty: "Easy",
        question: "Which organ pumps blood around the body?",
        options: [
            "Lungs",
            "Brain",
            "Heart",
            "Kidney"
        ],
        answer: 2,
        explanation: "The heart pumps blood around the body."
    },

    {
        id: "science-002",
        subject: "Science",
        topic: "Chemistry",
        difficulty: "Easy",
        question: "What is the chemical symbol for oxygen?",
        options: [
            "Ox",
            "O",
            "C",
            "H"
        ],
        answer: 1,
        explanation: "The chemical symbol for oxygen is O."
    },

    {
        id: "science-003",
        subject: "Science",
        topic: "Biology",
        difficulty: "Easy",
        question: "Which organ is mainly responsible for breathing?",
        options: [
            "Heart",
            "Lungs",
            "Stomach",
            "Kidney"
        ],
        answer: 1,
        explanation: "The lungs are responsible for gas exchange during breathing."
    },

    {
        id: "science-004",
        subject: "Science",
        topic: "Chemistry",
        difficulty: "Easy",
        question: "What state of matter is water at room temperature?",
        options: [
            "Solid",
            "Liquid",
            "Gas",
            "Plasma"
        ],
        answer: 1,
        explanation: "Water is normally a liquid at room temperature."
    },


    // ==================================================
    // SCIENCE — MEDIUM
    // ==================================================

    {
        id: "science-005",
        subject: "Science",
        topic: "Biology",
        difficulty: "Medium",
        question: "Where does photosynthesis mainly take place?",
        options: [
            "Nucleus",
            "Chloroplasts",
            "Mitochondria",
            "Cell membrane"
        ],
        answer: 1,
        explanation: "Photosynthesis takes place mainly in chloroplasts."
    },

    {
        id: "science-006",
        subject: "Science",
        topic: "Physics",
        difficulty: "Medium",
        question: "What is the unit of force?",
        options: [
            "Joule",
            "Watt",
            "Newton",
            "Volt"
        ],
        answer: 2,
        explanation: "Force is measured in newtons (N)."
    },

    {
        id: "science-007",
        subject: "Science",
        topic: "Chemistry",
        difficulty: "Medium",
        question: "What is the pH of a neutral solution?",
        options: [
            "0",
            "5",
            "7",
            "14"
        ],
        answer: 2,
        explanation: "A neutral solution has a pH of 7."
    },

    {
        id: "science-008",
        subject: "Science",
        topic: "Physics",
        difficulty: "Medium",
        question: "What is the equation for speed?",
        options: [
            "Speed = time ÷ distance",
            "Speed = distance ÷ time",
            "Speed = distance × time",
            "Speed = force ÷ mass"
        ],
        answer: 1,
        explanation: "Speed = distance ÷ time."
    },


    // ==================================================
    // SCIENCE — HARD
    // ==================================================

    {
        id: "science-009",
        subject: "Science",
        topic: "Physics",
        difficulty: "Hard",
        question: "What happens to current if resistance increases while voltage stays constant?",
        options: [
            "It increases",
            "It decreases",
            "It stays exactly the same",
            "It becomes infinite"
        ],
        answer: 1,
        explanation: "Using I = V ÷ R, increasing resistance decreases current when voltage is constant."
    },

    {
        id: "science-010",
        subject: "Science",
        topic: "Chemistry",
        difficulty: "Hard",
        question: "What type of reaction occurs when an acid reacts with an alkali?",
        options: [
            "Combustion",
            "Neutralisation",
            "Oxidation",
            "Electrolysis"
        ],
        answer: 1,
        explanation: "An acid reacting with an alkali is a neutralisation reaction."
    },

    {
        id: "science-011",
        subject: "Science",
        topic: "Biology",
        difficulty: "Hard",
        question: "Which structure controls what enters and leaves a cell?",
        options: [
            "Nucleus",
            "Cell membrane",
            "Cytoplasm",
            "Ribosome"
        ],
        answer: 1,
        explanation: "The cell membrane controls substances entering and leaving the cell."
    },


    // ==================================================
    // SCIENCE — VERY HARD
    // ==================================================

    {
        id: "science-012",
        subject: "Science",
        topic: "Physics",
        difficulty: "Very Hard",
        question: "A car travels 150 metres in 12 seconds. What is its average speed?",
        options: [
            "10.5 m/s",
            "12.5 m/s",
            "14.5 m/s",
            "18 m/s"
        ],
        answer: 1,
        explanation: "Speed = distance ÷ time. 150 ÷ 12 = 12.5 m/s."
    },

    {
        id: "science-013",
        subject: "Science",
        topic: "Physics",
        difficulty: "Very Hard",
        question: "A force of 20 N acts on a 5 kg object. What is its acceleration?",
        options: [
            "2 m/s²",
            "4 m/s²",
            "5 m/s²",
            "10 m/s²"
        ],
        answer: 1,
        explanation: "Using F = ma, acceleration = 20 ÷ 5 = 4 m/s²."
    }

];
