export interface Bid {
  id: string;
  title: string;
  agency: string;
  date: string;
  deadline: string;
  status: 'Open' | 'Closed' | 'Urgent';
  keywordsMatched: string[];
  link: string;
}

export interface UserSettings {
  emails: string[];
  keywords: string[];
  excludeKeywords: string[];
  emailEnabled: boolean;
}

export interface StatData {
  name: string;
  value: number;
}
