
const API_KEY = import.meta.env.VITE_TRELLO_API_KEY;
const TOKEN = import.meta.env.VITE_TRELLO_TOKEN;
const BOARD_ID = import.meta.env.VITE_TRELLO_BOARD_ID;

export interface TrelloCard {
  id: string;
  name: string;
  idList: string;
  dateLastActivity: string;
}

export interface TrelloList {
  id: string;
  name: string;
}

export interface TrelloAction {
  id: string;
  idMemberCreator: string;
  data: {
    listBefore?: { id: string; name: string };
    listAfter?: { id: string; name: string };
    card: { id: string; name: string };
    old?: { idList: string };
  };
  type: string;
  date: string;
}

async function trelloFetch<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const query = new URLSearchParams({
    key: API_KEY,
    token: TOKEN,
    ...params,
  }).toString();

  const response = await fetch(`https://api.trello.com/1${path}?${query}`);
  if (!response.ok) {
    throw new Error(`Trello API error: ${response.statusText}`);
  }
  return response.json();
}

export async function fetchBoardLists(): Promise<TrelloList[]> {
  return trelloFetch(`/boards/${BOARD_ID}/lists`);
}

export async function fetchBoardCards(): Promise<TrelloCard[]> {
  return trelloFetch(`/boards/${BOARD_ID}/cards`);
}

export async function fetchBoardActions(since?: string): Promise<TrelloAction[]> {
  const params: Record<string, string> = {
    limit: '1000',
    filter: 'updateCard:idList,createCard',
  };
  if (since) params.since = since;
  
  return trelloFetch(`/boards/${BOARD_ID}/actions`, params);
}
