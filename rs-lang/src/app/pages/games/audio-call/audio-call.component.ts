import { Component, HostListener, OnInit, OnDestroy } from '@angular/core';
import { SprintGameService } from '../../../services/sprintgame.service';
import { StatisticsService } from '../../../services/statistics.service';
import { HttpClient } from '@angular/common/http';
import { lastValueFrom, of, Subscription, take, timer } from 'rxjs';
import { StorageService } from '../../../services/storage.service';
import { MatDialog, MatDialogConfig } from '@angular/material/dialog';
import { ResultFormComponent } from '../result-form/result-form.component';
import { Word } from '../../../models/words.model';
import { ActivatedRoute } from '@angular/router';
import { UserAggregatedWordResponse } from '../../../models/user-aggregated-word-response.model';
import { UserAggregatedWord } from '../../../models/user-aggregated-word.model';
import { UserWord } from '../../../models/user-word.model';
import { FooterService } from '../../components/footer/footer.service';

const BASE_URL = 'https://rss-rslang-be.herokuapp.com/';
const GAME_TIME = 10;
const rightAnswerSound = '/assets/sounds/positive-beep.mp3';
const wrongAnswerSound = '/assets/sounds/negative-beep.mp3';

@Component({
  selector: 'app-audio-call',
  templateUrl: './audio-call.component.html',
  styleUrls: ['./audio-call.component.scss']
})
export class AudioCallComponent implements OnInit, OnDestroy {

  difficulty = 0;
  time = GAME_TIME;
  results: (Word | UserAggregatedWord)[] = [];
  params?: { group?: string; page?: string };
  isFromTextbook = false;
  englishWord: string = '';
  russianWord: string | undefined = '';
  audio = '';
  life = 5;
  answer = 0;
  answersText = {
    firstAnswer: '',
    secondAnswer: '',
    thirdAnswer: '',
    forthAnswer: '',
  };
  gameTimer?: Subscription;
  isLogged: boolean = false;
  page = 0;
  userId: string = '';
  cardsPerPage = 20;
  words: (Word | UserAggregatedWord)[] = [];
  isMistake = false;
  currentWord?: Word | UserAggregatedWord;
  isNewWord = true;
  newWordCount = 0;
  requestBody?: UserWord;
  bestSeries: Array<number> = [];
  correctSeries = 0;
  rightAnswers: UserAggregatedWord[] = [];
  wrongAnswers: UserAggregatedWord[] = [];
  uniqueWords: Set<Word> = new Set();
  gameName = 'audioCall';
  score = 0;
  initialPage = 0;
  isAnswer = false;
  flag = false;

  constructor(
    private sprintGameService: SprintGameService,
    private http: HttpClient,
    public dialog: MatDialog,
    private storageService: StorageService,
    private route: ActivatedRoute,
    private statisticsService: StatisticsService,
    private footerService: FooterService
  ) {}

  ngOnInit(): void {
    window.scrollTo(0, 0);
    this.isLogged = this.storageService.isLoggedIn();
    this.userId = this.storageService.getUser()?.userId || '';

    this.route.queryParams.pipe(take(1)).subscribe((value) => {
      this.params = value as { group?: string; page?: string };
      if (this.params.group) {
        this.isFromTextbook = true;
      }
    });

    if (this.isFromTextbook) {
      this.difficulty = Number(this.params?.group);
      this.page = this.initialPage = Number(this.params?.page);
      this.startGame();
    } else {
      this.sprintGameService.difficulty$.pipe(take(1)).subscribe((difficulty) => {
        this.difficulty = difficulty;
        this.startGame();
      });
    }
    this.footerService.hide();
  }

  ngOnDestroy(): void {
    this.gameTimer?.unsubscribe();
    this.footerService.show();
  }

  startGame() {
    this.showWord();
  }

  async getWord() {

    let wordsPage;
    if (this.isFromTextbook) {
      wordsPage = this.page;
    } else {
      wordsPage = Math.floor(Math.random() * 29);
    }

    if (this.words.length === 0) {
      if (this.userId) {
        const queryParams = `users/${this.userId}/aggregatedWords?group=${this.difficulty}&page=${wordsPage}&wordsPerPage=${this.cardsPerPage}`;
        const url = `${BASE_URL}${queryParams}`;
        const data = this.http.get<UserAggregatedWordResponse[]>(url);
        const wordsReaponse = await lastValueFrom(data);

        if (this.isFromTextbook) {
          this.words = wordsReaponse[0].paginatedResults.filter((word) => word.userWord?.difficulty !== 'easy');
        } else {
          this.words = wordsReaponse[0].paginatedResults;
        }

      } else {
        const queryParams = `?group=${this.difficulty}&page=${wordsPage}`;
        const url = `${BASE_URL}words${queryParams}`;
        const data = this.http.get<Word[]>(url);
        const wordsReaponse = await lastValueFrom(data);
        this.words = wordsReaponse;
      }
      this.page -= 1;
    }

    const index = Math.floor(Math.random() * this.words.length);
    this.currentWord = this.words[index];

    for (const property in this.answersText) {
      let answer = '';

      while (answer === this.words[index].wordTranslate || !answer) {
        answer = await this.getWrongAnswer();
      }

      this.answersText[property as keyof typeof this.answersText] = answer;
    }

    this.answer = Math.floor(1 + Math.random() * (4 + 1 - 1));
    const rightAnswerKey = Object.keys(this.answersText)[this.answer - 1];
    this.answersText[rightAnswerKey as keyof typeof this.answersText] = this.words[index].wordTranslate;

    this.getSound();
    this.words.splice(index, 1);
    return this.currentWord;
  }

  getSound() {
    const sound = new Audio(`${BASE_URL}${this.currentWord?.audio}`);
    sound.play();
  }

  async showWord() {
    if (this.life) {
      const word = await this.getWord();
      this.results.push(word);
      this.audio = `${BASE_URL}${word.audio}`;
      this.englishWord = word.word;
      this.russianWord = word.wordTranslate;
      this.setGameTimer();
    } else {
     this.gameOver();
    }
  }

  setGameTimer() {
    this.gameTimer = timer(1000, 1000).subscribe(() => {
      if (this.time) {
        this.time--;
      } else {
        const sound = new Audio(wrongAnswerSound);
        sound.play();
        this.life--;
        this.gameTimer?.unsubscribe();
        this.bestSeries.push(this.correctSeries);
        this.wrongAnswers.push(this.currentWord as UserAggregatedWord);
        this.correctSeries = 0;
        this.isMistake = true;
        this.time = GAME_TIME;
        if (this.userId) {
          this.saveWordStats();
        }
        this.showWord();
      }
    });
  }

  async getWrongAnswer() {
    const page = Math.floor(Math.random() * 29);
    const data = this.http.get<Word[]>(`${BASE_URL}words?group=${this.difficulty}&page=${page}`);
    const words = await lastValueFrom(data);
    const word = Math.floor(Math.random() * 19);

    return words[word].wordTranslate
  }

  checkAnswer(answer: number) {
    this.isAnswer = true;
    setTimeout(() => this.isAnswer = false, 300);

    const currentWord = this.currentWord as UserAggregatedWord;
    if (answer !== this.answer) {
      const sound = new Audio(wrongAnswerSound);
      sound.play();
      this.life--;
      this.isMistake = true;
      this.bestSeries.push(this.correctSeries);
      this.wrongAnswers.push(currentWord);
      this.correctSeries = 0;
    } else {
      const sound = new Audio(rightAnswerSound);
      sound.play();

      if (this.correctSeries <= 2) {
        this.score += 10;
      } else if (this.correctSeries > 2 && this.correctSeries <= 4) {
        this.score += 30;
      } else if (this.correctSeries > 4 && this.correctSeries <= 6) {
        this.score += 50;
      } else if (this.correctSeries > 6) {
        this.score += 70;
      }

      this.correctSeries++;
      this.results[this.results.length - 1].answer = true;
      this.rightAnswers.push(currentWord);
      this.isMistake = false;
    }

    this.gameTimer?.unsubscribe();
    this.time = GAME_TIME;

    if (this.userId) {
      this.saveWordStats();
    }

    if (this.page < 0 && this.words.length === 0 && this.isFromTextbook) {
      this.gameOver();
    } else {
      this.showWord();
    }
  }

  saveWordStats() {
    const currentWord = this.currentWord as UserAggregatedWord;
    let isNewWord = !currentWord.userWord?.optional;

    if (isNewWord) {
      this.newWordCount++;
      if (currentWord.userWord?.difficulty) {
        this.requestBody = {
          ...currentWord.userWord,
          optional: { total: 1, success: this.isMistake ? 0 : 1, strike: this.isMistake ? 0 : 1 },
        };

        this.sprintGameService.updateUserWord(this.userId, currentWord._id, this.requestBody).subscribe();
      } else {
        this.requestBody = { optional: { total: 1, success: this.isMistake ? 0 : 1, strike: this.isMistake ? 0 : 1 } };
        this.sprintGameService.createUserWord(this.userId, currentWord._id, this.requestBody).subscribe();
      }
    } else {
      let currentTotal = currentWord.userWord?.optional?.total as number;
      let currentSuccess = currentWord.userWord?.optional?.success as number;
      let currentStrike = currentWord.userWord?.optional?.strike as number;

      currentStrike = this.isMistake ? 0 : ++currentStrike;
      if (
        (currentStrike > 2 && currentWord.userWord?.difficulty !== 'hard') ||
        (currentStrike > 4 && currentWord.userWord?.difficulty === 'hard')
        ) {
        this.requestBody = {
          ...currentWord.userWord,
          difficulty: 'easy',
          optional: {
            total: ++currentTotal,
            success: this.isMistake ? currentSuccess : ++currentSuccess,
            strike: currentStrike,
          },
        };
      } else if (this.isMistake && currentWord.userWord?.difficulty === 'easy') {
        this.requestBody = {
          optional: {
            total: ++currentTotal,
            success: this.isMistake ? currentSuccess : ++currentSuccess,
            strike: currentStrike,
          },
          difficulty: 'normal',
        };
      } else {
        this.requestBody = {
          ...currentWord.userWord,
          optional: {
            total: ++currentTotal,
            success: this.isMistake ? currentSuccess : ++currentSuccess,
            strike: currentStrike,
          },
        };
       }

      this.sprintGameService.updateUserWord(this.userId, currentWord._id, this.requestBody).subscribe();
    }
  }

  showResult() {
    this.sprintGameService.sendResult(this.results);
    this.openDialog();
  }

  openDialog(): void {
    this.dialog.open(ResultFormComponent, {
      width: '700px',
      maxHeight: '85vh',
      data: { 
        score: this.score, 
        wrong: this.wrongAnswers.length,
        right: this.rightAnswers.length
      },
      disableClose: true,
      panelClass: 'audio-call-dialog'
    } as MatDialogConfig).afterClosed().pipe(take(1)).subscribe((result) => {
      if(result) {
        this.startGame();
      }
    });
  }

  checkKey(key: unknown) {
    switch (key) {
      case '1':
        this.checkAnswer(1);
        break;
      case '2':
        this.checkAnswer(2);
        break;
      case '3':
        this.checkAnswer(3);
        break;
      case '4':
        this.checkAnswer(4);
        break;
      default:
        break;
    }
  }

  gameOver() {
    this.gameTimer?.unsubscribe();
    this.bestSeries.push(this.correctSeries);
    this.showResult();
    if (this.userId) {
      this.saveGameStats();
    }
    this.resetData();
  }

  saveGameStats() {
    const bestSeries = Math.max(...this.bestSeries);
    const successPercentage = Math.round((this.rightAnswers.length * 100) / this.results.length);

    this.statisticsService.setUserStatistics(
      this.rightAnswers,
      this.wrongAnswers,
      bestSeries,
      successPercentage,
      this.newWordCount,
      this.gameName
    );
  }

  resetData() {
    this.page = this.initialPage;
    this.time = GAME_TIME;
    this.score = 0;
    this.life = 5;
    this.words = [];
    this.results = [];
    this.newWordCount = 0;
    this.correctSeries = 0;
    this.bestSeries = [];
    this.rightAnswers = [];
    this.wrongAnswers = [];
  }

  @HostListener('window:keydown', ['$event'])
  handleKeyboardDown(event: KeyboardEvent) {
    if (!this.flag) {
      this.flag = true;
      const key = event.key;
      this.checkKey(key);
    }
  }

  @HostListener('window:keyup', ['$event'])
  handleKeyboardUp(event: KeyboardEvent) {
    this.flag = false;
  }

}
