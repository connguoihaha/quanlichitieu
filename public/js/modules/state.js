import { DEFAULT_CATEGORIES } from './constants.js';

export const state = {
    transactions: [],
    categories: new Set(DEFAULT_CATEGORIES),
    filter: {
        current: 'day', // day, week, month, year, search, all
        viewDate: new Date(),
        searchCriteria: {
            keyword: '',
            category: 'all',
            dateFrom: null,
            dateTo: null,
            amountMin: null,
            amountMax: null
        }
    },
    trend: {
        filter: '7days',
        category: 'all',
        speedDays: 14 // 7, 14, 30
    },
    heatmap: {
        currentDate: new Date()
    },
    ui: {
        editingTransactionId: null
    }
};

export function setTransactions(newTransactions) {
    state.transactions = newTransactions;
}

export function addTransaction(transaction) {
    state.transactions.unshift(transaction);
}

export function updateTransaction(id, updatedData) {
    const index = state.transactions.findIndex(t => t.id === id);
    if (index !== -1) {
        state.transactions[index] = { ...state.transactions[index], ...updatedData };
    }
}

export function deleteTransaction(id) {
    const index = state.transactions.findIndex(t => t.id === id);
    if (index !== -1) {
        state.transactions.splice(index, 1);
    }
}
