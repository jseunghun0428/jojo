
int * __thiscall FUN_00419102(void *this,LPVOID param_1,DWORD param_2)

{
  BOOL BVar1;
  int local_10;
  int *local_8;
  
  local_10 = 0;
  local_8 = this;
  if (*(int *)this == 0) {
LAB_00419134:
    local_8 = (int *)0x0;
  }
  else {
    while (BVar1 = ReadFile(*(HANDLE *)this,param_1,param_2,(LPDWORD)&local_8,(LPOVERLAPPED)0x0),
          BVar1 == 0) {
      if (5 < local_10) goto LAB_00419134;
      local_10 = local_10 + 1;
    }
  }
  return local_8;
}

