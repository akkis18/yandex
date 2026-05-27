import { Scenes } from 'telegraf';
import { Taxipark } from '@prisma/client';

export interface RegistrationData {
  phone?: string;
  fullname?: string;
  license_front_file_id?: string;
  license_back_file_id?: string | null;
  tex_passport_front_file_id?: string | null;
  tex_passport_back_file_id?: string | null;
}

export interface BotSession {
  taxiparkId?: string;
  registration?: RegistrationData;
  registrationResult?: {
    fullname: string;
    phone: string;
    license_front_file_id: string;
    license_back_file_id: string;
    tex_passport_front_file_id: string;
    tex_passport_back_file_id: string;
  };
  __scenes?: Scenes.WizardSessionData;
}

export interface BotState {
  taxiparkId?: string;
  taxipark?: Taxipark;
}

export interface BotContext extends Scenes.WizardContext<Scenes.WizardSessionData> {
  session: BotSession;
  state: BotState;
}

