import express from 'express';
import hbs from 'express-handlebars';
import http from 'http';
import path from 'path';
import {fileURLToPath} from 'url';
import * as helpers from '../helpers/helpers.js'
import crypto from 'crypto'
import cookieParser from 'cookie-parser'

function generateRandomString(length: number) {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const randomBytes = crypto.randomBytes(length);
    let result = '';
  
    for (let i = 0; i < length; i++) {
      const randomIndex = randomBytes[i] % characters.length;
      result += characters.charAt(randomIndex);
    }
  
    return result;
  }

//import {Controller} from "./entities/controller.js";

function payByCard(card: Card, value: number): boolean {
    if (!card.contract || card.contract.accCurrent.balance < value || card.attempts !== 3) return false;
    card.contract.accCurrent.credit += value
    accountCashRegister.debit += value
    accountCashRegister.credit += value
    fixBalance([card.contract.accCurrent, accountCashRegister])
    return true;
}
function findCard(number: string, pin: string): Card | undefined {
    const card = cards.find((card) => card.number === number);
    if (!card) return undefined;
    if (card.pin !== pin) {
        card.attempts -= 1
        return undefined;
    }
    return card
}
function createNewCard(client_id: number, credit_id: number): Card {
    let randomNumber = Math.floor(Math.random() * 10000); // Generate a random number between 0 and 9999
    let numberString = randomNumber.toString().padStart(4, '0'); // Convert the number to a string and pad it with leading zeros if necessary
    let number = "3456-" 
    + ((client_id * 17 + 6789) % 10000).toString().padStart(4, '0') + "-" 
    + ((credit_id * 31 + 4321) % 10000).toString().padStart(4, '0') + "-" 
    + Math.floor(Math.random() * 10000).toString().padStart(4, '0')
    return {
        number: number,
        pin: numberString,
        contract: null, 
        attempts: 3,
        otp: ''
    }
}

function isLessThanOrEqualDay(date1: Date, date2: Date) {
    const d1 = new Date(date1.getFullYear(), date1.getMonth(), date1.getDate());
    const d2 = new Date(date2.getFullYear(), date2.getMonth(), date2.getDate());
  
    return d1 <= d2;
  }
function padTo2Digits(num: number) {
    return num.toString().padStart(2, '0');
}
function format(date: Date) {
    return [
        padTo2Digits(date.getDate()),
        padTo2Digits(date.getMonth() + 1),
        date.getFullYear(),
    ].join('.');
}
function setControlEAN13(account: BankAccount): BankAccount {
    const ean13String = account.balanceNo + account.clientNo + account.accountNo;

    let oddSum = 0;
    let evenSum = 0;

    for (let i = 0; i < ean13String.length; i++) {
        let digit = parseInt(ean13String[i]);
        if ((i + 1) % 2 === 0) {
            evenSum += digit;
        } else {
            oddSum += digit;
        }
    }

    let result = oddSum * 3 + evenSum;
    let checksumDigit = result % 10;

    account.controlNo = checksumDigit.toString();
    return account
}
function addAccountForClient(client: Client, type: string, currency: string, value: number, info: string): BankAccount {
    const lastBalNo = client.accounts.length
    const account = setControlEAN13({
        surname: client.surname,
        name: client.name,
        patronymic: client.patronymic,
        debit: value,
        credit: value,
        balance: 0,
        type: type,
        balanceNo: type.toLocaleLowerCase() == "active" ? "2400" : "3014",
        clientNo: client.id.toString().padStart(5, '0'),
        accountNo: (lastBalNo + 1).toString().padStart(3, '0'),
        controlNo: "X",
        currency: currency,
        info: info
    })
    client.accounts.push(account)
    return account
}
function processBankingDay(): void {
    console.log(`processBankingDay date ${date}`)
    clients.forEach(client => {
        // process client deposits
        client.deposits.forEach(deposit => {
            if (!deposit.active) return
            deposit.active = isLessThanOrEqualDay(date, deposit.endDate)
            if (deposit.active) {
                // deposit is still active
                const value = deposit.interestRate / 365 * deposit.value
                console.log(`deposit payments ${value} at ${date}`)
                // Interest accrual
                deposit.accInterest.credit += value
                accountCashHolder.debit += value
                if (deposit.revocable) {
                    // Interest withdrawal (part)
                    deposit.accInterest.debit += value
                    accountCashRegister.debit += value
                    accountCashRegister.credit += value
                }
            } else {
                // finish of contract?
                console.log(`deposit withdrawal at ${date}`)
                // Interest withdrawal (full)
                if (!deposit.revocable) {
                    deposit.accInterest.debit += deposit.accInterest.credit
                    accountCashRegister.debit += deposit.accInterest.credit
                    accountCashRegister.credit += deposit.accInterest.credit
                }
                // Deposit withdrawal
                accountCashHolder.debit += deposit.value
                deposit.accCurrent.credit += deposit.value
                deposit.accCurrent.debit += deposit.value
                accountCashRegister.debit += deposit.value
                accountCashRegister.credit += deposit.value
                //
                deposit.accCurrent.info += " (Закрыт)"
                deposit.accInterest.info += " (Закрыт)"
            }
        })
        // process client credits
        client.credits.forEach(credit => {
            if (!credit.active) return
            //
            credit.active = isLessThanOrEqualDay(date, credit.endDate)
            // finish of contract?
            if (!credit.active) {
                // here credit must be 0.0 ???
                console.log(`credit withdrawal at ${date}`)
                //
                credit.accCurrent.info += " (Закрыт)"
                credit.accInterest.info += " (Закрыт)"
                return
            }
            // credit is still active
            const days = (credit.endDate.getTime() - credit.startDate.getTime()) / (1000 * 3600 * 24)
            console.log(`days ${days}`)

            let valueA = 0
            let valueB = 0
            if (credit.revocable) { // annuity
                const interestDaily = credit.interestRate / 365
                const daily = credit.value * interestDaily * Math.pow(1 + interestDaily, days) / (Math.pow(1 + interestDaily, days) - 1)
                console.log(`daily ${daily}`)

                valueA = daily - credit.value / days
                valueB = credit.value / days
            } else {
                const interestDaily = credit.interestRate / 365
                const daysLeft = (credit.endDate.getTime() - date.getTime()) / (1000 * 3600 * 24)

                valueA = (credit.value / days * (daysLeft + 1)) * interestDaily
                valueB = credit.value / days
            }

            console.log(`credit payments ${valueA + valueB} at ${date}`)
            // Interest accrual
            credit.accInterest.credit += valueA
            accountCashHolder.credit += valueA
            // receive payments for credit interest
            accountCashRegister.debit += valueA
            accountCashRegister.credit += valueA
            credit.accInterest.debit += valueA
            // receive payments for credit value
            accountCashRegister.debit += valueB
            accountCashRegister.credit += valueB
            credit.accCurrent.debit += valueB
            // end of credit (money back)
            credit.accCurrent.credit += valueB
            accountCashHolder.credit += valueB
        })
    })
    //
    fixBalance(accounts)
}
function fixBalance(accounts: BankAccount[]): void {
    accounts.forEach(account => {
        if (account.type.toLowerCase() === "active") {
            account.balance = account.debit - account.credit
        } else {
            account.balance = account.credit - account.debit
        }
    })
}

// get current filename and directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// setup our server data
const PORT = 8000;
const HOST = 'localhost';

const currentDate = new Date();
let date = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate()); // TO 00:00
interface Contract {
    accCurrent: BankAccount,
    accInterest: BankAccount,
    value: number,
    interestRate: number,
    revocable: boolean,
    startDate: Date,
    endDate: Date,
    active: boolean,
    card: Card | null
}
interface BankAccount {
    surname: string;
    name: string;
    patronymic: string;
    debit: number;
    credit: number;
    balance: number;
    type: string;
    balanceNo: string;
    clientNo: string;
    accountNo: string;
    controlNo: string;
    currency: string;
    info: string;
}
interface Client {
    "id": number,
    "surname": string,
    "name": string,
    "patronymic": string,
    "birthdate": string,
    "gender": string,
    "passportSeries": string,
    "passportNumber": string,
    "issuedBy": string,
    "issueDate": string,
    "identificationNumber": string,
    "placeOfBirth": string,
    "residenceCity": string,
    "residenceAddress": string,
    "homePhone": string,
    "mobilePhone": string,
    "email": string,
    "registrationCity": string,
    "maritalStatus": string,
    "citizenship": string,
    "disability": string,
    "pensioner": string,
    "monthlyIncome": string,
    "militaryService": string,
    "accounts": BankAccount[],
    "deposits": Contract[],
    "credits": Contract[]
}
interface Card {
    number: string,
    pin: string,
    contract: Contract | null,
    attempts: number,
    otp: string
}
// setup express
const server_root = path.resolve(__dirname, '../public');
const server_views = path.resolve(__dirname, '../views');
const server_attachments = path.resolve(__dirname, '../uploads');
const app = express();
const handlebars = hbs.create({
    layoutsDir: server_views + '/layouts',
    extname: '.hbs',
    defaultLayout: 'main',
    helpers: helpers
});
// handlebars setup
app.engine('.hbs', handlebars.engine);
app.set('view engine', '.hbs');
app.set('views', server_views);
app.use(express.urlencoded({extended: false}));
app.use(express.json())
app.use(express.static(server_root));
app.use('/attachments', express.static(server_attachments))
app.use(cookieParser());

// create server
const server = http.createServer(app);

const clients: Client[] = [
    {
        "id": 1,
        "surname": "Иванов",
        "name": "Иван",
        "patronymic": "Иванович",
        "birthdate": "1990-01-01",
        "gender": "Мужской",
        "passportSeries": "AB",
        "passportNumber": "123456",
        "issuedBy": "Отделом УФМС России",
        "issueDate": "2015-10-05",
        "identificationNumber": "12345678901234567890",
        "placeOfBirth": "1",
        "residenceCity": "1",
        "residenceAddress": "ул. Пушкина, д. 10, кв. 5",
        "homePhone": "+7 (123) 456-78-90",
        "mobilePhone": "+7 (987) 654-32-10",
        "email": "ivanov@example.com",
        "registrationCity": "1",
        "maritalStatus": "single",
        "citizenship": "1",
        "disability": "n",
        "pensioner": "n",
        "monthlyIncome": "1500",
        "militaryService": "y",
        "accounts": [],
        "deposits": [],
        "credits": []
    }
]

const accounts: BankAccount[] = [
    setControlEAN13({
        "surname": "",
        "name": "",
        "patronymic": "",
        "debit": 0,//"+0",
        "credit": 0,//"-0",
        "balance": 0,
        "type": "Active",
        "balanceNo": "1010",
        "clientNo": "00000",
        "accountNo": "000",
        "controlNo": "B",
        "currency": "BYN",
        "info": "Касса Банка"
    }),
    setControlEAN13({
        "surname": "",
        "name": "",
        "patronymic": "",
        "debit": 0,//"-0",
        "credit": 100000000,//"+0",
        "balance": 0,
        "type": "Passive",
        "balanceNo": "7327",
        "clientNo": "00000",
        "accountNo": "001",
        "controlNo": "B",
        "currency": "BYN",
        "info": "СФРБ Банка"
    }),
]
const accountCashRegister = accounts[0];
const accountCashHolder = accounts[1];

const cards: Card[] = []

app.get('/atm',(req,res) => {
    res.render('atm.hbs', {layout : 'atm'});
});
app.get('/',(req,res) => {
    res.render('main.hbs', {layout : 'index'});
});
app.get('/time_machine',(req,res) => {
    // @ts-ignore
    res.render('time_machine.hbs', {layout : 'index', date: format(date)});
});
app.post('/time_machine',(req,res) => {
    const {time} = req.body
    const dt = parseInt(time)
    //
    // TODO call DB to process each day of payments
    //
    for (let i = 0; i < dt; i++) {
        date = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
        processBankingDay()
    }
    res.render('time_machine.hbs', {layout : 'index', date: format(date)});
});
app.get('/add_client',(req,res) => {
    res.render('add_client.hbs', {layout : 'index'});
});
app.post('/add_client', (req, res) => {
    // Retrieve form data from request body
    const formData = Object.assign({}, req.body);
    // console.log(req.body);

    const index = clients.findIndex(client =>
        (client.passportSeries === formData.passportSeries && client.passportNumber === formData.passportNumber) ||
        client.identificationNumber === formData.identificationNumber
    );
    if (index !== -1) {
        return res.render('add_client.hbs', {layout : 'index', error: true, client: formData});
    }

    formData.id = (clients.length > 0 ? clients[clients.length - 1].id + 1 : 1);
    clients.push(formData);

    // Process the form data as needed
    // For example, you can access formData.mobilePhone, formData.surname, etc.

    // Send a response back to the client
    //res.status(200).send('Form submitted successfully!');
    res.render('add_client.hbs', {layout : 'index', error: false, client: formData});
});

app.get('/deposit',(req,res) => {
    res.render('deposit.hbs', {layout : 'index'});
});
app.post('/deposit',(req,res) => {
    const formData = req.body;
    const clientId = parseInt(formData.contractNumber)
    console.log(formData);
    // check if client with id exists
    const index = clients.findIndex(client =>
        client.id === clientId
    );
    if (index === -1) {
        return res.render('deposit.hbs', {layout : 'index', error: true});
    }
    let depositType = "безотз"
    if (formData.depositType.toLowerCase() === "revocable") {
        depositType = "отзывн"
    }
    // Deposit contract creation process
    // Add two accounts to user
    const client = clients[formData.contractNumber - 1];
    // create two accounts for client
    const value = parseInt(formData.depositAmount)
    const accCurrent =  addAccountForClient(client, "Passive", 
        formData.currencyType, 0, `Текущий счет ${depositType} депозита`);
    const accInterest = addAccountForClient(client, "Passive", 
        formData.currencyType, 0, `Процентный счет ${depositType} депозита`);
    accounts.push(accCurrent)
    accounts.push(accInterest)
    // add deposit to client
    const card: Card = {number: "0000-0000-0000-0000", pin: "0000", contract: null, attempts: 3, otp: ''};
    const contract: Contract = {
        accCurrent: accCurrent,
        accInterest: accInterest,
        interestRate: parseFloat(formData.interestRate) * 0.01, // TODO
        revocable: formData.depositType === "revocable",
        endDate: new Date(date.getFullYear(), date.getMonth(), date.getDate() + parseInt(formData.interestTime)),
        startDate: new Date(date),
        value: value,
        active: true,
        card: card
    };
    card.contract = contract
    client.deposits.push(contract)
    // cards.push(card)
    // add records to bank accounts (signing the contract)
    accountCashRegister.debit += value
    accountCashRegister.credit += value
    accCurrent.credit += value
    accCurrent.debit += value
    accountCashHolder.credit += value
    //
    fixBalance([accountCashRegister, accountCashHolder, accCurrent, accInterest])
    //
    console.log("deposit contract signed")
    console.log(client)
    //
    res.render('deposit.hbs', {layout : 'index', error: false});
});
app.get('/credit',(req,res) => {
    res.render('credit.hbs', {layout : 'index'});
});
app.post('/credit',(req,res) => {
    const formData = req.body;
    const clientId = parseInt(formData.contractNumber)
    console.log(formData);
    // check if client with id exists
    const index = clients.findIndex(client =>
        client.id === clientId
    );
    if (index === -1) {
        return res.render('credit.hbs', {layout : 'index', error: true});
    }
    // 
    let creditType = "дифф"
    if (formData.creditType === "a") {
        creditType = "аннуитетн"
    }
    //
    // Credit contract creation process
    // Add two accounts to user
    const client = clients[formData.contractNumber - 1];
    // create two accounts for client
    const value = parseInt(formData.creditAmount)
    const accCurrent =  addAccountForClient(client, "Active", 
        "BYN", 0, `Текущий счет ${creditType} кредита`);
    const accInterest = addAccountForClient(client, "Active", 
        "BYN", 0, `Процентный счет ${creditType} кредита`);
    accounts.push(accCurrent)
    accounts.push(accInterest)
    // add credit to client
    const card: Card = createNewCard(client.id, client.deposits.length);
    const contract: Contract = {
        accCurrent: accCurrent,
        accInterest: accInterest,
        interestRate: 0.14, // TODO fixed interest rate
        revocable: formData.creditType === "a", // here it means annuity
        endDate: new Date(date.getFullYear(), date.getMonth(), date.getDate() + parseInt(formData.interestTime)),
        startDate: new Date(date),
        value: value,
        active: true,
        card: card
    };
    card.contract = contract;
    client.credits.push(contract);
    cards.push(card)
    // add records to bank accounts (signing the contract)
    accountCashHolder.debit += value
    accCurrent.debit += value
    // THIS IS AUTO CASH REMOVAL BY CLIENT. COMMENTED IT OUT TO ALLOW SPEND MONEY FROM IT LATER
    //accCurrent.credit += value
    //accountCashRegister.debit += value
    //accountCashRegister.credit += value
    //
    fixBalance([accountCashRegister, accountCashHolder, accCurrent, accInterest])
    // generate plan
    const plan: {date: Date, payment: number, rest: number, sum: number}[] = []
    if (formData.creditType === "a") { // annuity
        const m = parseInt(formData.interestTime)
        const s = value
        const interestDaily = 0.14 / 365
        const daily = s*interestDaily * Math.pow(1+interestDaily, m) / (Math.pow(1+interestDaily, m) - 1)
        let rest = s
        let sum = 0
        for (let i = 0; i < m; ++i) {
            rest -= s / m
            sum += daily
            plan.push({
                date: new Date(date.getFullYear(), date.getMonth(), date.getDate() + i + 1),
                payment: daily,
                rest: Math.abs(rest),
                sum: Math.abs(sum)
            })
        }
    } else {
        const m = parseInt(formData.interestTime)
        const s = value
        const interestDaily = 0.14 / 365
        let dailyFirst = s / m  + s * interestDaily
        let rest = s
        let sum = 0
        for (let i = 0; i < m; i++) {
            dailyFirst = s / m  + rest * interestDaily
            sum += dailyFirst
            rest -= s / m
            plan.push({
                date: new Date(date.getFullYear(), date.getMonth(), date.getDate() + i + 1),
                payment: dailyFirst,
                rest: Math.abs(rest),
                sum: Math.abs(sum)
            })
        }
    }
    //
    console.log("credit contract signed")
    console.log(client)
    //
    res.render('credit.hbs', {layout : 'index', error: false, plan: plan});
});

app.get('/accounts',(req,res) => {
    res.render('accounts.hbs', {
        layout : 'index',
        accounts: accounts});
});
app.get('/clients',(req,res) => {
    res.render('clients.hbs', {
        layout : 'index',
        clients: clients
    });
});
app.delete('/clients/:id', (req, res) => {
    const id = parseInt(req.params.id);

    console.log(`client delete request ${id}`)

    // Find the index of the client with the specified ID
    // const index = -1; // TODO db request clients.findIndex(client => client.id === id);
    const index = clients.findIndex(client => client.id === id);
    console.log(`index ${index}`)

    // If client with the specified ID is found, delete it
    if (index !== -1) {
        clients.splice(index, 1);
        res.render('clients.hbs', {
            layout : 'index',
            clients: clients,
            error: false
        });
    } else {
        // If client with the specified ID is not found, return 404 Not Found
        res.status(404).json({ error: `Client with ID ${id} not found` });
    }
});
app.get('/edit_client/:id', (req, res) => {
    const id = parseInt(req.params.id);
    console.log(`client edit request ${id}`)
    // get client data by id
    const client = clients[id - 1]

    if (!client) {
        return res.status(404).render('404.hbs', {layout : 'index'});
    }

    res.render('add_client.hbs', {
        layout : 'index',
        client: client,
        edit: true
    });
});
app.get('/contracts/:id', (req, res) => {
    const id = parseInt(req.params.id);
    console.log(`client edit request ${id}`)
    // get client data by id
    const client = clients[id - 1]

    if (!client) {
        return res.status(404).render('404.hbs', {layout : 'index'});
    }

    res.render('contracts.hbs', {
        layout : 'index',
        client: client
    });
});
app.post('/contracts/:client_id/:id', (req, res) => {
    const id = parseInt(req.params.id);
    const client_id = parseInt(req.params.client_id);
    console.log(`contract revoke request ${client_id} ${id}`)
    // get client data by id
    const client = clients[client_id - 1]
    const deposit = client.deposits[id]

    if (!client || !deposit || !deposit.active ) {
        return res.render('contracts.hbs', {
            layout : 'index',
            client: client,
            error: true
        });
    }
    // Revoke deposit (DUPLICATED!!!!!)
    // finish of contract?
    console.log(`deposit withdrawal on demand at ${date}`)
    deposit.active = false
    // Deposit withdrawal
    accountCashHolder.debit += deposit.value
    deposit.accCurrent.credit += deposit.value
    deposit.accCurrent.debit += deposit.value
    accountCashRegister.debit += deposit.value
    accountCashRegister.credit += deposit.value
    //
    deposit.accCurrent.info += " (Закрыт досрочно)"
    deposit.accInterest.info += " (Закрыт досрочно)"
    //
    fixBalance([accountCashRegister, accountCashHolder, deposit.accCurrent, deposit.accInterest])
    //
    res.render('contracts.hbs', {
        layout : 'index',
        client: client,
        error: false
    });
});
app.post('/contracts/unlock/:client_id/:id', (req, res) => {
    const id = parseInt(req.params.id);
    const client_id = parseInt(req.params.client_id);
    console.log(`contract unlock request ${client_id} ${id}`)
    // get client data by id
    const client = clients[client_id - 1]
    const credit = client.credits[id]

    if (!client || !credit || !credit.active || !credit.card) {
        return res.render('contracts.hbs', {
            layout : 'index',
            client: client,
            error: true
        });
    }
    //
    credit.card.attempts = 3;
    //
    res.render('contracts.hbs', {
        layout : 'index',
        client: client,
        error: false
    });
});
app.post('/edit_client/:id', (req, res) => {
        const id = parseInt(req.params.id);
        console.log(`client uck request ${id}`)
        // get client data by id
        const client = Object.assign({}, req.body);
        client.id = id // >??????
        // if success
        clients[id-1] = client
        //res.redirect(`/clients`);
        res.render('add_client.hbs',
            {layout : 'index',
                error: false,
                client: client,
                edit: true
            });
    }
);
//
app.post('/atm/login', (req, res) => {
    // @ts-ignore
    const {pin, number} = req.body
    // Find the card by number
    console.log(req.body)
    console.log(cards)
    const card = cards.find(card => card.number === number);
    if (!card) {
        return res.status(404).json({ error: "Card not found" });
    }
    if (card.attempts === 0) {
        return res.status(403).json({ error: "Card is blocked" });
    }
    if (card.pin !== pin) {
        card.attempts--;
        if (card.attempts === 0) {
            return res.status(403).json({ error: "Card is blocked" });
        }
        return res.status(401).json({ error: `Wrong PIN. ${card.attempts} attempts left`});
    }

    // Proceed with successful login
    // You can perform any necessary logic here
    card.attempts = 3

    const OTP = generateRandomString(64)
    card.otp = OTP
    res.cookie('OTP', `${number}|${OTP}`, {
        maxAge: 120000,
        httpOnly: true,
        path: '/',
      });

    return res.status(200).json({ success: "Login successful" });
});
app.get('/atm/balance', (req, res) => {
    const [number, otp] = req.cookies.OTP.split('|');
    //
    const card = cards.find(card => card.number === number);
    if (!card) {
        return res.status(404).json({ error: "Card not found" });
    }
    if (card.otp !== otp || card.otp === '') {
        card.otp = ''
        return res.status(403).json({ error: "OTP has expired" });
    }
    card.otp = ''
    //
    let currentDate = new Date();
    return res.status(200).json({ error: "OK", receipt: {
        reason: `Просмотр баланса`,
        date: currentDate.toLocaleDateString(),
        time: currentDate.toLocaleTimeString(),
        id: Math.floor(Math.random() * 100000000).toString().padStart(8, '0'),
        accountNo: `${card.number.slice(0,4)}-XXXX-XXXX-${card.number.slice(-4)}`,
        sum: `0 BYN`,
        balance: `${card.contract?.accCurrent.balance} BYN`,
    } });
})
app.post('/atm/withdraw', (req, res) => {
    const [number, otp] = req.cookies.OTP.split('|');
    const {sum} = req.body
    //
    const card = cards.find(card => card.number === number);
    if (!card) {
        return res.status(404).json({ error: "Card not found" });
    }
    if (card.otp !== otp || card.otp === '') {
        card.otp = ''
        return res.status(403).json({ error: "OTP has expired" });
    }
    card.otp = ''
    const s = parseInt(sum)
    if (!s) {
        return res.status(400).json({ error: "Wrong sum" });
    }
    //
    if (!payByCard(card, s)) {
        return res.status(400).json({ error: "Not enough balance" });
    } else {
        let currentDate = new Date();
        return res.status(200).json({ error: "OK", receipt: {
            reason: `Снятие наличных`,
            date: currentDate.toLocaleDateString(),
            time: currentDate.toLocaleTimeString(),
            id: Math.floor(Math.random() * 100000000).toString().padStart(8, '0'),
            accountNo: `${card.number.slice(0,4)}-XXXX-XXXX-${card.number.slice(-4)}`,
            sum: `${s} BYN`,
            balance: `${card.contract?.accCurrent.balance} BYN`,
        } });
    }
})
app.post('/atm/payment', (req, res) => {
    const [number, otp] = req.cookies.OTP.split('|');
    const {sum, phone} = req.body
    //
    const card = cards.find(card => card.number === number);
    if (!card) {
        return res.status(404).json({ error: "Card not found" });
    }
    if (card.otp !== otp || card.otp === '') {
        card.otp = ''
        return res.status(403).json({ error: "OTP has expired" });
    }
    card.otp = ''
    const s = parseInt(sum)
    if (!s) {
        return res.status(400).json({ error: "Wrong sum" });
    }
    //
    if (!payByCard(card, s)) {
        return res.status(400).json({ error: "Not enough balance" });
    } else {
        let currentDate = new Date();
        return res.status(200).json({ error: "OK", receipt: {
            reason: `Пополнение мобильного телефона ${phone}`,
            date: currentDate.toLocaleDateString(),
            time: currentDate.toLocaleTimeString(),
            id: Math.floor(Math.random() * 100000000).toString().padStart(8, '0'),
            accountNo: `${card.number.slice(0,4)}-XXXX-XXXX-${card.number.slice(-4)}`,
            sum: `${s} BYN`,
            balance: `${card.contract?.accCurrent.balance} BYN`,
        } });
    }

})

// 404
app.all('*', function(req, res){
    res.status(404).render('404.hbs', {layout : 'index'});
});

// enable
server.listen(PORT, HOST, () => {
    console.log(`Server is running on ${HOST}:${PORT}`);
});