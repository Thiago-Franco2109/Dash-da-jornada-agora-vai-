
import type { TrelloAction, TrelloCard, TrelloList } from '../lib/trello';
import { differenceInHours, differenceInDays } from 'date-fns';

export interface ListDuration {
  listId: string;
  listName: string;
  entryDate: string;
  exitDate?: string;
  durationHours: number;
  durationDays: number;
}

export interface CardDuration {
  cardId: string;
  cardName: string;
  durations: ListDuration[];
  totalOnboardingDays: number;
  currentListId: string;
}

export function calculateDurations(
  cards: TrelloCard[],
  lists: TrelloList[],
  actions: TrelloAction[]
): CardDuration[] {
  // Map list names for easy lookup
  const listMap = new Map(lists.map(l => [l.id, l.name]));
  
  // Group actions by card
  const cardActionsMap = new Map<string, TrelloAction[]>();
  actions.forEach(action => {
    const cardId = action.data.card.id;
    if (!cardActionsMap.has(cardId)) {
      cardActionsMap.set(cardId, []);
    }
    cardActionsMap.get(cardId)!.push(action);
  });

  return cards.map(card => {
    // Sort actions by date ascending
    const cardActions = (cardActionsMap.get(card.id) || []).sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    const durations: ListDuration[] = [];
    
    // Initial entry (createCard action or the first move we have)
    // If no actions, we might not have the full history, but we can assume 
    // it's in its current list since it was created.
    
    let lastEntryDate = cardActions.length > 0 ? cardActions[0].date : undefined;
    let currentListId = cardActions.length > 0 ? (cardActions[0].data.listAfter?.id || cardActions[0].data.listBefore?.id || card.idList) : card.idList;

    // We iterate through actions to track moves
    cardActions.forEach((action) => {
      if (action.type === 'createCard') {
        lastEntryDate = action.date;
        currentListId = card.idList; // initially
      } else if (action.type === 'updateCard' && action.data.listAfter) {
        // Card moved from listBefore to listAfter
        const exitDate = action.date;
        const entryDate = lastEntryDate || exitDate; // fallback
        
        const listBeforeId = action.data.listBefore?.id;
        const listName = listMap.get(listBeforeId || '') || action.data.listBefore?.name || 'Desconhecida';

        durations.push({
          listId: listBeforeId || '',
          listName,
          entryDate,
          exitDate,
          durationHours: differenceInHours(new Date(exitDate), new Date(entryDate)),
          durationDays: differenceInDays(new Date(exitDate), new Date(entryDate)),
        });

        // Update for the new list
        lastEntryDate = exitDate;
        currentListId = action.data.listAfter.id;
      }
    });

    // Add current list duration (from lastEntryDate until now)
    if (lastEntryDate) {
      const now = new Date();
      const listName = listMap.get(currentListId) || 'Lista Atual';
      
      durations.push({
        listId: currentListId,
        listName,
        entryDate: lastEntryDate,
        durationHours: differenceInHours(now, new Date(lastEntryDate)),
        durationDays: differenceInDays(now, new Date(lastEntryDate)),
      });
    }

    const totalDays = durations.reduce((acc, curr) => acc + curr.durationDays, 0);

    return {
      cardId: card.id,
      cardName: card.name,
      durations,
      totalOnboardingDays: totalDays,
      currentListId: card.idList,
    };
  });
}
